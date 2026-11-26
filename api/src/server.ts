import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { databaseHost, diagnoseDbError, redactUrl, resolveSslMode } from './lib/database.js';
import { pendingMigrations } from './lib/migrations.js';
import { autoCancelLatePending } from './modules/admin/alerts.admin.js';
import { purgeIdleGuests } from './modules/auth/auth.service.js';
import { notifyOrderStatus } from './modules/orders/notify.js';

const config = loadConfig();
const pool = createPool(config.database);
const app = await buildApp({ pool, config });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Check the database once at start-up and say clearly what is wrong (the server keeps running,
// so the websites can show it and /health reports it).
try {
  const { rows } = await pool.query(
    `SELECT current_setting('server_version') AS version,
            to_regclass('public.schema_migrations') IS NOT NULL AS migrated`,
  );
  app.log.info(
    `database connected: ${databaseHost(config.database.url)} (PostgreSQL ${rows[0].version}, ssl=${resolveSslMode(config.database)})`,
  );
  if (!rows[0].migrated) app.log.warn('database is empty: run `npm run db:reset` (development) or `npm run db:migrate`');
  else {
    const pending = await pendingMigrations(pool);
    if (pending?.length) {
      app.log.error(
        `DATABASE IS OLDER THAN THE CODE: ${pending.length} migration(s) not applied (${pending.join(', ')}). ` +
          'Some pages will fail until you run: npm run db:migrate (then restart the server)',
      );
    }
  }
} catch (err) {
  const problem = diagnoseDbError(err, config.database.url);
  app.log.error(
    `DATABASE NOT REACHABLE (${redactUrl(config.database.url)}): ${problem?.hint ?? (err as Error).message}. ` +
      'Check with: npm run db:check',
  );
}

// Guests (cart without an account) idle for 30 days are deleted: at start-up, then daily.
const purgeGuests = () =>
  purgeIdleGuests(pool, new Date(), config.auth.guestRetentionDays)
    .then((n) => n > 0 && app.log.info(`deleted ${n} idle guest account(s)`))
    .catch((err) => app.log.warn({ err }, 'guest clean-up failed'));
void purgeGuests();
setInterval(purgeGuests, 24 * 3_600_000).unref();

// Optional (PENDING_AUTO_CANCEL_MINUTES > 0): every minute, cancel orders no store confirmed in time.
const autoCancelMinutes = config.orderAlerts.autoCancelPendingMinutes;
if (autoCancelMinutes > 0) {
  app.log.info(`pending orders are cancelled automatically after ${autoCancelMinutes} minutes`);
  setInterval(() => {
    autoCancelLatePending(pool, new Date(), autoCancelMinutes)
      .then((ids) => {
        if (ids.length) app.log.warn(`auto-cancelled ${ids.length} order(s) not confirmed in ${autoCancelMinutes} min`);
        for (const id of ids) notifyOrderStatus(app, id);
      })
      .catch((err) => app.log.warn({ err }, 'auto-cancel failed'));
  }, 60_000).unref();
}
