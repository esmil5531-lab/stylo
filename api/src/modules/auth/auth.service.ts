import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import type { Queryable } from '../../db.js';
import { inTransaction } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { AppError, badRequest, forbidden } from '../../lib/errors.js';
import { normalisePhone } from '../../lib/phone.js';
import type { Messenger } from '../../lib/messaging.js';

/**
 * Sign-in with a Libyan mobile number + one-time code, for every kind of user:
 * customers (app 'customer'), and staff / store owners (app 'admin').
 *
 *  1. POST /auth/otp/request { phone }       → a 6-digit code by WhatsApp (valid 5 min)
 *  2. POST /auth/otp/verify  { phone, code } → { token, refreshToken } (opaque)
 *  3. POST /auth/refresh     { refreshToken } → a new pair (rotation), no code needed
 *
 * Customers: short access token (bearer, 24 h) + long refresh token (180 days, renewed on every
 * use, kept in the phone's secure storage) — the code is asked once per device. A refresh token
 * that was already rotated and is replayed later revokes the whole session (stolen token).
 * Guests (POST /auth/guest) browse and fill a cart without a phone; at sign-in their cart and
 * favourites move to the account and the guest row is deleted. Back office: 12 h, no refresh.
 *
 * Only hashes are stored: sha256(pepper:phone:code) for codes, sha256(token) for sessions.
 * Limits: 5 wrong attempts per code, 5 codes per phone per hour, 30 s between codes.
 * A new number becomes a customer account on first sign-in (name required);
 * the back office only admits active staff.
 */

export type AuthApp = 'customer' | 'admin';

function hashCode(pepper: string, phone: string, code: string): string {
  return createHash('sha256').update(`${pepper}:${phone}:${code}`).digest('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function requestOtp(ctx: Ctx, messenger: Messenger, rawPhone: string) {
  const cfg = ctx.config.auth;
  const phone = normalisePhone(rawPhone);

  const { rows } = await ctx.db.query(
    `SELECT count(*)::int AS last_hour, max(created_at) AS last_at
       FROM otp_codes WHERE phone = $1 AND created_at > $2::timestamptz - interval '1 hour'`,
    [phone, ctx.now],
  );
  const lastAt = rows[0].last_at as Date | null;
  if (lastAt) {
    const wait = Math.ceil(cfg.otpResendSeconds - (ctx.now.getTime() - lastAt.getTime()) / 1000);
    if (wait > 0) {
      throw new AppError(429, 'otp_cooldown', `انتظري ${wait} ثانية قبل طلب رمز جديد`, { retryAfter: wait });
    }
  }
  if (rows[0].last_hour >= cfg.otpMaxPerHour) {
    throw new AppError(429, 'otp_limit', 'طلبتِ رموزاً كثيرة، حاولي بعد ساعة');
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(ctx.now.getTime() + cfg.otpTtlSeconds * 1000);
  await ctx.db.query(
    `INSERT INTO otp_codes (phone, code_hash, expires_at, created_at) VALUES ($1, $2, $3, $4)`,
    [phone, hashCode(cfg.otpPepper, phone, code), expiresAt, ctx.now],
  );
  await messenger.sendOtp(phone, code);

  return {
    phone,
    /** Where the code was sent: 'whatsapp' | 'sms' | 'console' (development). */
    channel: messenger.channel,
    expiresInSeconds: cfg.otpTtlSeconds,
    resendInSeconds: cfg.otpResendSeconds,
    // Development only: the code also comes back in the response and is shown on screen.
    ...(cfg.otpDevEcho ? { devCode: code } : {}),
  };
}

export interface VerifyInput {
  phone: string;
  code: string;
  app: AuthApp;
  fullName?: string;
  userAgent?: string;
  /** The caller's current guest account, if any (its cart moves to the signed-in account). */
  guestUserId?: string | null;
}

export async function verifyOtp(ctx: Ctx, input: VerifyInput) {
  const cfg = ctx.config.auth;
  const phone = normalisePhone(input.phone);
  const code = input.code.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).trim();

  // Step 1 — check the code OUTSIDE any transaction, so a wrong attempt is recorded for good
  // (inside the transaction the increment would be rolled back with the error = unlimited guesses).
  const { rows } = await ctx.db.query(
    `SELECT id, code_hash, attempts, expires_at FROM otp_codes
      WHERE phone = $1 AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  const otp = rows[0];
  if (!otp || (otp.expires_at as Date) <= ctx.now) {
    throw badRequest('code_expired', 'انتهت صلاحية الرمز، اطلبي رمزاً جديداً');
  }
  if (otp.attempts >= cfg.otpMaxAttempts) {
    throw new AppError(429, 'too_many_attempts', 'محاولات خاطئة كثيرة، اطلبي رمزاً جديداً');
  }
  if (!/^\d{6}$/.test(code) || !sameHash(otp.code_hash, hashCode(cfg.otpPepper, phone, code))) {
    const upd = await ctx.db.query<{ attempts: number }>(
      `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
      [otp.id],
    );
    const left = cfg.otpMaxAttempts - (upd.rows[0]?.attempts ?? cfg.otpMaxAttempts);
    throw badRequest('invalid_code', left > 0 ? `الرمز غير صحيح، تبقّت ${left} محاولات` : 'الرمز غير صحيح');
  }

  // Step 2 — the code is right: create the account/session atomically, using the code once.
  return inTransaction(ctx.db, async (db) => {
    const lock = await db.query(
      `SELECT id FROM otp_codes WHERE id = $1 AND consumed_at IS NULL AND attempts < $2 FOR UPDATE`,
      [otp.id, cfg.otpMaxAttempts],
    );
    if (!lock.rows[0]) throw badRequest('code_expired', 'انتهت صلاحية الرمز، اطلبي رمزاً جديداً');

    let user = (await findUserByPhone(db, phone)) ?? null;

    if (input.app === 'admin') {
      // The back office never creates accounts: staff are added by an admin first.
      const staff = user
        ? await db.query(`SELECT is_active FROM staff_members WHERE user_id = $1`, [user.id])
        : { rows: [] };
      if (!staff.rows[0]?.is_active) {
        throw forbidden('هذا الرقم غير مسجّل كموظف في ستايلو. تواصلي مع المدير.');
      }
    } else if (!user) {
      const fullName = input.fullName?.trim();
      // The code stays valid so the customer can resubmit it with their name.
      if (!fullName || fullName.length < 2) throw badRequest('name_required', 'أهلاً بك! اكتبي اسمك لإنشاء الحساب');
      const created = await db.query(
        `INSERT INTO users (full_name, phone, role) VALUES ($1, $2, 'customer') RETURNING id, full_name, phone, role`,
        [fullName, phone],
      );
      user = created.rows[0];
    }
    const u = user!;

    await db.query(`UPDATE otp_codes SET consumed_at = $2 WHERE id = $1`, [otp.id, ctx.now]);

    // Signing in from a guest session: the guest's cart and favourites become the account's.
    let merged = false;
    if (input.app === 'customer' && input.guestUserId && input.guestUserId !== u.id) {
      merged = await mergeGuest(db, input.guestUserId, u.id as string);
    }

    const session = await createSession(db, ctx, u.id as string, input.app, input.userAgent);
    return {
      ...session,
      mergedGuestCart: merged,
      user: { id: u.id as string, fullName: u.full_name as string, phone: u.phone as string, role: u.role as string },
    };
  });
}

async function findUserByPhone(db: Queryable, phone: string) {
  const { rows } = await db.query(`SELECT id, full_name, phone, role FROM users WHERE phone = $1`, [phone]);
  return rows[0];
}

/** Bearer token → { userId, guest } (or null). Touches last_seen_at at most every 5 minutes. */
export async function resolveSession(
  db: Queryable,
  token: string,
  now: Date,
): Promise<{ userId: string; guest: boolean } | null> {
  const { rows } = await db.query(
    `WITH s AS (
       UPDATE sessions SET last_seen_at = CASE WHEN last_seen_at < $2::timestamptz - interval '5 minutes'
                                               THEN $2 ELSE last_seen_at END
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2
        RETURNING user_id)
     SELECT s.user_id, u.role::text = 'guest' AS guest
       FROM s JOIN users u ON u.id = s.user_id
      WHERE u.deleted_at IS NULL`,
    [hashToken(token), now],
  );
  const r = rows[0];
  return r ? { userId: r.user_id as string, guest: r.guest as boolean } : null;
}

// ----------------------------------------------------------------------------- sessions & refresh

export interface IssuedSession {
  token: string;
  expiresAt: string;
  /** Customers and guests only (the back office signs in again after 12 h). */
  refreshToken?: string;
  refreshExpiresAt?: string;
}

const newSecret = () => randomBytes(32).toString('base64url');

async function createSession(
  db: Queryable,
  ctx: Ctx,
  userId: string,
  app: AuthApp,
  userAgent?: string,
): Promise<IssuedSession> {
  const cfg = ctx.config.auth;
  const token = newSecret();
  if (app === 'admin') {
    const expiresAt = new Date(ctx.now.getTime() + cfg.adminSessionHours * 3_600_000);
    await db.query(
      `INSERT INTO sessions (user_id, token_hash, app, user_agent, created_at, last_seen_at, expires_at)
       VALUES ($1, $2, 'admin', $3, $4, $4, $5)`,
      [userId, hashToken(token), userAgent?.slice(0, 200) ?? null, ctx.now, expiresAt],
    );
    return { token, expiresAt: expiresAt.toISOString() };
  }
  const refreshToken = newSecret();
  const expiresAt = new Date(ctx.now.getTime() + cfg.customerAccessHours * 3_600_000);
  const refreshExpiresAt = new Date(ctx.now.getTime() + cfg.customerRefreshDays * 86_400_000);
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, app, user_agent, created_at, last_seen_at, expires_at,
                           refresh_hash, refresh_expires_at)
     VALUES ($1, $2, 'customer', $3, $4, $4, $5, $6, $7)`,
    [userId, hashToken(token), userAgent?.slice(0, 200) ?? null, ctx.now, expiresAt, hashToken(refreshToken), refreshExpiresAt],
  );
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    refreshToken,
    refreshExpiresAt: refreshExpiresAt.toISOString(),
  };
}

/** Seconds during which a just-rotated refresh token may be replayed (its response was lost). */
const REFRESH_GRACE_SECONDS = 60;

/**
 * Exchanges a refresh token for a new access + refresh pair (the old refresh token stops working).
 * Replaying an already-rotated token after the grace period means it was copied: the session is
 * revoked and the person signs in again with a code.
 */
export async function refreshSession(ctx: Ctx, refreshToken: string): Promise<IssuedSession> {
  const cfg = ctx.config.auth;
  const h = hashToken(refreshToken);
  const expired = () => new AppError(401, 'session_expired', 'انتهت الجلسة، سجّلي الدخول من جديد');
  const result = await inTransaction(ctx.db, async (db): Promise<IssuedSession | 'expired'> => {
    const { rows } = await db.query(
      `SELECT s.id, s.refresh_hash = $1 AS current, s.refreshed_at, s.refresh_expires_at, u.deleted_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE (s.refresh_hash = $1 OR s.previous_refresh_hash = $1) AND s.revoked_at IS NULL AND s.app = 'customer'
        FOR UPDATE OF s`,
      [h],
    );
    const s = rows[0];
    if (!s || s.deleted_at || (s.refresh_expires_at as Date) <= ctx.now) return 'expired';
    if (!s.current) {
      const age = s.refreshed_at ? (ctx.now.getTime() - (s.refreshed_at as Date).getTime()) / 1000 : Infinity;
      if (age > REFRESH_GRACE_SECONDS) {
        // Replayed old token: revoke (committed — the error is thrown after the transaction).
        await db.query(`UPDATE sessions SET revoked_at = $2 WHERE id = $1`, [s.id, ctx.now]);
        return 'expired';
      }
    }
    const token = newSecret();
    const next = newSecret();
    const expiresAt = new Date(ctx.now.getTime() + cfg.customerAccessHours * 3_600_000);
    const refreshExpiresAt = new Date(ctx.now.getTime() + cfg.customerRefreshDays * 86_400_000);
    await db.query(
      `UPDATE sessions SET token_hash = $2, expires_at = $3, refresh_hash = $4, refresh_expires_at = $5,
              previous_refresh_hash = CASE WHEN refresh_hash = $6 THEN $6 ELSE previous_refresh_hash END,
              refreshed_at = $7, last_seen_at = $7
        WHERE id = $1`,
      [s.id, hashToken(token), expiresAt, hashToken(next), refreshExpiresAt, h, ctx.now],
    );
    return { token, expiresAt: expiresAt.toISOString(), refreshToken: next, refreshExpiresAt: refreshExpiresAt.toISOString() };
  });
  if (result === 'expired') throw expired();
  return result;
}

/** An anonymous guest account + session: browsing, favourites and the cart, never checkout. */
export async function createGuest(ctx: Ctx, userAgent?: string) {
  return inTransaction(ctx.db, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO users (full_name, role) VALUES ('زائر', 'guest') RETURNING id`,
    );
    const session = await createSession(db, ctx, rows[0].id as string, 'customer', userAgent);
    return { ...session, user: { id: rows[0].id as string, role: 'guest' as const } };
  });
}

/**
 * Moves a guest's cart, favourites and shared carts to `userId`, then deletes the guest.
 * Cart rule (one store per cart): the guest cart is the newest intent — it replaces an account
 * cart from another store; from the same store the quantities add up (within stock).
 */
export async function mergeGuest(db: Queryable, guestId: string, userId: string): Promise<boolean> {
  const guest = await db.query(`SELECT 1 FROM users WHERE id = $1 AND role::text = 'guest' FOR UPDATE`, [guestId]);
  if (!guest.rows[0]) return false;
  const gc = await db.query(`SELECT store_id FROM carts WHERE user_id = $1`, [guestId]);
  let merged = false;
  if (gc.rows[0]) {
    const uc = await db.query(`SELECT store_id FROM carts WHERE user_id = $1 FOR UPDATE`, [userId]);
    if (uc.rows[0] && uc.rows[0].store_id !== gc.rows[0].store_id) {
      await db.query(`DELETE FROM carts WHERE user_id = $1`, [userId]);
    }
    await db.query(
      `INSERT INTO carts (user_id, store_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET updated_at = now()`,
      [userId, gc.rows[0].store_id],
    );
    await db.query(
      `INSERT INTO cart_items (user_id, variant_id, quantity)
       SELECT $1, ci.variant_id, ci.quantity FROM cart_items ci WHERE ci.user_id = $2
       ON CONFLICT (user_id, variant_id) DO UPDATE
         SET quantity = GREATEST(1, LEAST(cart_items.quantity + EXCLUDED.quantity, 20,
                                          (SELECT stock_qty FROM product_variants WHERE id = EXCLUDED.variant_id)))`,
      [userId, guestId],
    );
    merged = true;
  }
  await db.query(
    `INSERT INTO wishlist_items (user_id, product_id)
     SELECT $1, product_id FROM wishlist_items WHERE user_id = $2 ON CONFLICT DO NOTHING`,
    [userId, guestId],
  );
  await db.query(`UPDATE shared_carts SET owner_id = $1 WHERE owner_id = $2`, [userId, guestId]);
  await db.query(`DELETE FROM users WHERE id = $1 AND role::text = 'guest'`, [guestId]);
  return merged;
}

/** Deletes guests idle for `days` (they never have orders). Returns how many. */
export async function purgeIdleGuests(db: Queryable, now: Date, days: number): Promise<number> {
  const { rowCount } = await db.query(
    `DELETE FROM users u
      WHERE u.role::text = 'guest' AND u.phone IS NULL AND u.email IS NULL
        AND COALESCE((SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id), u.created_at)
            < $1::timestamptz - make_interval(days => $2)`,
    [now, days],
  );
  return rowCount ?? 0;
}

export async function revokeSession(db: Queryable, token: string, now: Date) {
  await db.query(`UPDATE sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL`, [
    hashToken(token),
    now,
  ]);
}
