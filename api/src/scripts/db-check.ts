import { promises as dns } from 'node:dns';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { databaseHost, diagnoseDbError, redactUrl, resolveSslMode } from '../lib/database.js';

/**
 * `npm run db:check` — step-by-step check of DATABASE_URL: DNS, connection, SSL, migrations, data.
 * Prints the cause and the fix for the usual problems (Supabase IPv6-only address, password, SSL…).
 */
const MIGRATIONS_DIR = fileURLToPath(new URL('../../../database/migrations/', import.meta.url));

const ok = (s: string) => console.log(`  ✓ ${s}`);
const bad = (s: string) => console.log(`  ✗ ${s}`);

async function main() {
  const config = loadConfig();
  const db = config.database;
  const host = databaseHost(db.url);
  console.log(`DATABASE_URL  ${redactUrl(db.url)}`);
  console.log(`SSL           ${resolveSslMode(db)}${db.ssl ? ' (DATABASE_SSL)' : ' (automatic)'}\n`);

  console.log('1) DNS');
  const [v4, v6] = await Promise.all([dns.resolve4(host).catch(() => []), dns.resolve6(host).catch(() => [])]);
  if (/^(localhost|127\.|::1)/.test(host)) ok(`${host} (this computer)`);
  else if (v4.length) ok(`${host} → IPv4 ${v4.join(', ')}`);
  else if (v6.length) {
    bad(`${host} has only IPv6 addresses (${v6[0]}) — most networks and Windows cannot reach it.`);
    if (/\.supabase\.co$/.test(host)) {
      console.log('    → Use Supabase\'s Session pooler URL (IPv4): Dashboard → Connect → "Session pooler"');
      console.log('      postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres');
    }
  } else bad(`${host} not found in DNS (wrong host, no internet, or the Supabase project is paused).`);

  console.log('\n2) Connection');
  const pool = createPool(db);
  try {
    const { rows } = await pool.query(`SELECT current_setting('server_version') AS v, current_user AS u, current_database() AS d`);
    ok(`connected as ${rows[0].u} to "${rows[0].d}" — PostgreSQL ${rows[0].v}`);
  } catch (err) {
    const p = diagnoseDbError(err, db.url);
    bad((err as Error).message);
    if (p) console.log(`    → ${p.hint}\n    → ${p.hintAr}`);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  console.log('\n3) Schema');
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const hasTable = (await pool.query(`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS t`)).rows[0].t;
  const applied = hasTable ? (await pool.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version) : [];
  const missing = files.map((f) => f.replace(/\.sql$/, '')).filter((v) => !applied.includes(v));
  if (missing.length === 0) ok(`all ${files.length} migrations applied`);
  else bad(`${missing.length} migration(s) not applied: ${missing.join(', ')} → run: npm run db:migrate (or db:reset)`);

  if (!missing.length) {
    console.log('\n4) Data');
    const { rows } = await pool.query(
      `SELECT (SELECT count(*) FROM stores)::int AS stores, (SELECT count(*) FROM products)::int AS products,
              (SELECT count(*) FROM categories)::int AS categories,
              (SELECT count(*) FROM staff_members WHERE is_active)::int AS staff`,
    );
    const r = rows[0];
    (r.categories ? ok : bad)(`${r.categories} categories, ${r.stores} stores, ${r.products} products`);
    (r.staff ? ok : bad)(
      `${r.staff} active back-office accounts${r.staff ? '' : ' → development: npm run db:reset · production: bootstrap --phone … --name …'}`,
    );
  }
  await pool.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
