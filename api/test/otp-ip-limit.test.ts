/** Sign-in codes per IP address: one connection cannot send codes to many numbers. */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = fileURLToPath(new URL('../../database/', import.meta.url));
let pool: Pool;
let app: FastifyInstance;

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  app = await buildApp({
    pool,
    config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, OTP_MAX_PER_IP_HOUR: '3' }),
    logger: false,
  });
});

after(async () => {
  await app?.close();
  await pool?.end();
});

const ask = (phone: string, ip = '10.0.0.1') =>
  app.inject({ method: 'POST', url: '/v1/auth/otp/request', payload: { phone }, remoteAddress: ip });

it('refuses a fourth code from the same IP within the hour, whatever the number', async () => {
  for (const n of ['0911000001', '0911000002', '0911000003']) assert.equal((await ask(n)).statusCode, 200);
  const res = await ask('0911000004');
  assert.equal(res.statusCode, 429);
  assert.equal(res.json().error.code, 'otp_ip_limit');
  assert.ok(Number(res.headers['retry-after']) > 0);
  // Another address is not affected.
  assert.equal((await ask('0911000004', '10.0.0.2')).statusCode, 200);
});
