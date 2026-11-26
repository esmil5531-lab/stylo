import type { Pool } from '../../db.js';

/**
 * Daily clean-up of data nobody needs any more (also `npm run db:cleanup`):
 * - sign-in codes expired for more than a day (only hashes, but no reason to keep them),
 * - sessions revoked or expired for more than 7 days (refresh window included),
 * - shared carts expired for more than 7 days (the link answers «انتهت صلاحية» meanwhile),
 * - WhatsApp/SMS log older than MESSAGE_LOG_DAYS (default 180: enough to answer a complaint).
 * Idle guest accounts are purged separately (purgeIdleGuests, 30 days).
 */
export interface CleanupResult {
  otpCodes: number;
  sessions: number;
  sharedCarts: number;
  messageLog: number;
}

export async function purgeExpiredData(pool: Pool, now: Date, opts: { messageLogDays?: number } = {}): Promise<CleanupResult> {
  const days = opts.messageLogDays ?? 180;
  const otp = await pool.query(`DELETE FROM otp_codes WHERE expires_at < $1::timestamptz - interval '1 day'`, [now]);
  const sessions = await pool.query(
    `DELETE FROM sessions
      WHERE (revoked_at IS NOT NULL AND revoked_at < $1::timestamptz - interval '7 days')
         OR GREATEST(expires_at, COALESCE(refresh_expires_at, expires_at)) < $1::timestamptz - interval '7 days'`,
    [now],
  );
  const shared = await pool.query(`DELETE FROM shared_carts WHERE expires_at < $1::timestamptz - interval '7 days'`, [now]);
  const messages = await pool.query(
    `DELETE FROM message_log WHERE created_at < $1::timestamptz - make_interval(days => $2::int)`,
    [now, days],
  );
  return {
    otpCodes: otp.rowCount ?? 0,
    sessions: sessions.rowCount ?? 0,
    sharedCarts: shared.rowCount ?? 0,
    messageLog: messages.rowCount ?? 0,
  };
}
