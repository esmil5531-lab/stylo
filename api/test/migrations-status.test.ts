/**
 * New code on an old database: /health lists the migrations not applied yet, and SQL errors caused
 * by a missing column answer 503 «database_outdated» (with the fix) instead of a bare 500.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';
import { isOutdatedSchemaError, migrationVersions } from '../src/lib/migrations.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = fileURLToPath(new URL('../../database/', import.meta.url));

let pool: Pool;
let app: FastifyInstance;
let versions: string[];

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  versions = await migrationVersions();
  for (const v of versions) await pool.query(await readFile(`${ROOT}migrations/${v}.sql`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
  app = await buildApp({ pool, config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB }), logger: false });
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('database older than the code', () => {
  it('a schema loaded by hand (not tracked) is healthy, migrations unknown', async () => {
    const res = await app.inject('/health');
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().migrations, 'unknown');
  });

  it('/health names the migrations not applied, and is healthy once they are', async () => {
    await pool.query('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    await pool.query('INSERT INTO schema_migrations (version) SELECT unnest($1::text[])', [versions.slice(0, -1)]);
    let res = await app.inject('/health');
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().ok, false);
    assert.equal(res.json().database, 'connected');
    assert.deepEqual(res.json().pending, [versions.at(-1)]);
    assert.match(res.json().hint, /db:migrate/);
    await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [versions.at(-1)]);
    res = await app.inject('/health');
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().migrations, 'up_to_date');
  });

  it('a missing column answers 503 database_outdated with the fix, not 500', async () => {
    const product = (await pool.query(`SELECT id FROM products LIMIT 1`)).rows[0].id;
    await pool.query('ALTER TABLE reviews DROP COLUMN updated_at');
    const res = await app.inject(`/v1/products/${product}/reviews`);
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error.code, 'database_outdated');
    assert.match(res.json().error.message, /npm run db:migrate/);
  });

  it('recognises the Postgres errors of an old schema only', () => {
    assert.ok(isOutdatedSchemaError({ code: '42703' }));
    assert.ok(isOutdatedSchemaError({ code: '42P01' }));
    assert.ok(isOutdatedSchemaError({ code: '22P02', message: 'invalid input value for enum user_role: "guest"' }));
    assert.ok(!isOutdatedSchemaError({ code: '22P02', message: 'invalid input syntax for type uuid: "x"' }));
    assert.ok(!isOutdatedSchemaError({ code: '23505' }));
  });
});
