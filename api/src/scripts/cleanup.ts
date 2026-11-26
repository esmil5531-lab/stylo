/** `npm run db:cleanup` — the daily clean-up on demand (the server also runs it every day). */
import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { purgeIdleGuests } from '../modules/auth/auth.service.js';
import { purgeExpiredData } from '../modules/maintenance/cleanup.js';

const config = loadConfig();
const pool = createPool(config.database);
try {
  const now = new Date();
  const r = await purgeExpiredData(pool, now, { messageLogDays: config.maintenance.messageLogDays });
  const guests = await purgeIdleGuests(pool, now, config.auth.guestRetentionDays);
  console.log(
    `✓ cleaned: ${r.otpCodes} sign-in codes, ${r.sessions} sessions, ${r.sharedCarts} shared carts, ` +
      `${r.messageLog} message-log rows, ${guests} idle guests`,
  );
} finally {
  await pool.end();
}
