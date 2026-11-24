/**
 * The websites are not built yet: / and /admin/ explain how to build them instead of a bare 404,
 * while the API keeps answering.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';

let pool: Pool;
let app: FastifyInstance;

before(async () => {
  pool = createPool(TEST_DB);
  const empty = mkdtempSync(join(tmpdir(), 'stylo-empty-'));
  app = await buildApp({
    pool,
    config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, CUSTOMER_WEB_DIR: empty, ADMIN_WEB_DIR: empty }),
    logger: false,
  });
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('websites not built', () => {
  it('/ explains how to build the customer site (Arabic, RTL, brand)', async () => {
    const res = await app.inject('/');
    assert.equal(res.statusCode, 503);
    assert.match(res.headers['content-type'] as string, /text\/html/);
    assert.ok(res.body.includes('<html lang="ar" dir="rtl">'));
    assert.ok(res.body.includes('كل ستايل في مكان واحد'));
    assert.ok(res.body.includes('npm run build:customer'));
    assert.equal((await app.inject('/product/abc')).statusCode, 503);
  });

  it('/admin/ explains how to build the back office', async () => {
    assert.equal((await app.inject('/admin')).statusCode, 302);
    const res = await app.inject('/admin/orders');
    assert.equal(res.statusCode, 503);
    assert.ok(res.body.includes('npm run build:admin'));
  });

  it('the API keeps answering', async () => {
    assert.equal((await app.inject('/health')).statusCode, 200);
    const missing = await app.inject('/v1/nope');
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, 'not_found');
  });

  it('outside tests the build folders default to the repo, wherever the server starts', () => {
    const cfg = loadConfig({ NODE_ENV: 'development' });
    assert.match(cfg.web.customerDir!, /mobile[\\/]dist$/);
    assert.match(cfg.web.adminDir!, /admin[\\/]dist$/);
  });
});
