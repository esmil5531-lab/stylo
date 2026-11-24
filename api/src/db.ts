import pg from 'pg';

import { poolOptions, type DatabaseConfig } from './lib/database.js';

// BIGINT (money in dirhams, counters) and NUMERIC (ratings) arrive as strings by default.
// All our BIGINT values are far below Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
// DATE stays 'YYYY-MM-DD' (a calendar day, e.g. a payout period) — never shifted by the server time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export type Pool = pg.Pool;
export type Queryable = pg.Pool | pg.PoolClient;

/**
 * A connection pool. Pass the whole database config (SSL for Supabase & co, see lib/database.ts);
 * a bare URL is a plain local connection (tests).
 */
export function createPool(db: string | DatabaseConfig): pg.Pool {
  const pool = new pg.Pool(poolOptions(typeof db === 'string' ? { url: db } : db));
  // An idle client losing its connection (cloud poolers restart) must not crash the process.
  pool.on('error', () => undefined);
  return pool;
}

export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Runs `fn` in a transaction: opens one on a Pool, or reuses the caller's when already on a client. */
export async function inTransaction<T>(db: Queryable, fn: (client: Queryable) => Promise<T>): Promise<T> {
  if ('release' in db) return fn(db);
  return withTransaction(db, fn);
}
