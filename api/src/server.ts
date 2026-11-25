import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { databaseHost, diagnoseDbError, redactUrl, resolveSslMode } from './lib/database.js';
import { purgeIdleGuests } from './modules/auth/auth.service.js';

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
