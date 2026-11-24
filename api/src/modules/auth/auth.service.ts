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
 *  2. POST /auth/otp/verify  { phone, code } → { token } (opaque bearer token)
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

    const token = randomBytes(32).toString('base64url');
    const ttlMs =
      input.app === 'admin' ? cfg.adminSessionHours * 3_600_000 : cfg.customerSessionDays * 86_400_000;
    const expiresAt = new Date(ctx.now.getTime() + ttlMs);
    await db.query(
      `INSERT INTO sessions (user_id, token_hash, app, user_agent, created_at, last_seen_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $5, $6)`,
      [u.id, hashToken(token), input.app, input.userAgent?.slice(0, 200) ?? null, ctx.now, expiresAt],
    );

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: { id: u.id as string, fullName: u.full_name as string, phone: u.phone as string, role: u.role as string },
    };
  });
}

async function findUserByPhone(db: Queryable, phone: string) {
  const { rows } = await db.query(`SELECT id, full_name, phone, role FROM users WHERE phone = $1`, [phone]);
  return rows[0];
}

/** Bearer token → user id (or null). Touches last_seen_at at most every 5 minutes. */
export async function resolveSession(db: Queryable, token: string, now: Date): Promise<string | null> {
  const { rows } = await db.query(
    `UPDATE sessions SET last_seen_at = CASE WHEN last_seen_at < $2::timestamptz - interval '5 minutes'
                                             THEN $2 ELSE last_seen_at END
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2
      RETURNING user_id`,
    [hashToken(token), now],
  );
  return (rows[0]?.user_id as string | undefined) ?? null;
}

export async function revokeSession(db: Queryable, token: string, now: Date) {
  await db.query(`UPDATE sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL`, [
    hashToken(token),
    now,
  ]);
}
