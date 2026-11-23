import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig } from '../config.js';
import { createPool } from '../db.js';

const MIGRATIONS_DIR = new URL('../../../database/migrations/', import.meta.url).pathname;

/**
 * Applies database/migrations/NNNN_*.sql in order, once each, tracked in schema_migrations.
 * Each file manages its own BEGIN/COMMIT.
 */
async function main() {
  const pool = createPool(loadConfig().databaseUrl);
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

    // Baseline: databases set up by hand from CLAUDE.md before this runner existed.
    const { rows: base } = await pool.query(
      `SELECT to_regtype('order_status') IS NOT NULL AS has0001,
              to_regtype('delivery_mode') IS NOT NULL AS has0002`,
    );
    if (base[0].has0001) await record(pool, '0001_init');
    if (base[0].has0002) await record(pool, '0002_libya_looks_delivery_sharing');

    const applied = new Set((await pool.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (applied.has(version)) continue;
      console.log(`→ applying ${file}`);
      await pool.query(await readFile(join(MIGRATIONS_DIR, file), 'utf8'));
      await record(pool, version);
    }
    console.log('✓ database is up to date');
  } finally {
    await pool.end();
  }
}

async function record(pool: ReturnType<typeof createPool>, version: string) {
  await pool.query('INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING', [version]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
