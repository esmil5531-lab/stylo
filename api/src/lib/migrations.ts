import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { Pool } from '../db.js';

// fileURLToPath, not URL.pathname: on Windows .pathname gives "/C:/…", which fs cannot open.
// Same folder from src/lib (tsx) and dist/lib (built), and in the Docker image.
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../database/migrations/', import.meta.url));

/** `NNNN_name` of every migration file, in order. */
export async function migrationVersions(dir = MIGRATIONS_DIR): Promise<string[]> {
  return (await readdir(dir))
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((f) => f.replace(/\.sql$/, ''));
}

/**
 * Migrations in database/migrations that this database has not applied yet. New code on an old
 * database fails with «column … does not exist»: the server reports this at start-up and on
 * /health so the fix (`npm run db:migrate`) is obvious. Empty list = up to date.
 * Returns null when the folder is not shipped (nothing to compare).
 */
export async function pendingMigrations(pool: Pool, dir = MIGRATIONS_DIR): Promise<string[] | null> {
  let versions: string[];
  try {
    versions = await migrationVersions(dir);
  } catch {
    return null;
  }
  const { rows } = await pool.query<{ tracked: boolean; schema: boolean }>(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS tracked,
            to_regtype('order_status') IS NOT NULL AS schema`,
  );
  // Not tracked: an empty database needs everything; a schema loaded by hand (tests) is unknown.
  if (!rows[0]?.tracked) return rows[0]?.schema ? null : versions;
  const applied = new Set(
    (await pool.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version),
  );
  return versions.filter((v) => !applied.has(v));
}

/** Postgres errors that mean «the code expects a newer schema» (a migration was not applied). */
export function isOutdatedSchemaError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code === '42703' || e?.code === '42P01' || e?.code === '42883' || e?.code === '42704') return true;
  // A new enum value (e.g. user_role 'guest'): «invalid input value for enum …».
  return e?.code === '22P02' && /for enum/i.test(e.message ?? '');
}
