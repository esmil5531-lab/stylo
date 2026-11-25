/**
 * Phase E security: CSP + headers on the websites and the API, and the extra request limits
 * (sign-in code checks per IP, refresh, checkout, cart sharing, reviews, uploads, /v1 per IP).
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';
import { contentSecurityPolicy, inlineScriptHashes } from '../src/lib/security-headers.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = fileURLToPath(new URL('../../database/', import.meta.url));
const HYDRATE = 'globalThis.__EXPO_ROUTER_HYDRATE__=true;';
const CUSTOMER = '00000000-0000-0000-0000-000000000004';
const OPS = '00000000-0000-0000-0000-000000000006';

let pool: Pool;
const apps: FastifyInstance[] = [];

async function app(env: Record<string, string> = {}) {
  const site = mkdtempSync(join(tmpdir(), 'stylo-site-'));
  mkdirSync(join(site, '_expo/static/js/web'), { recursive: true });
  writeFileSync(join(site, '_expo/static/js/web/entry-abc.js'), 'console.log(1)');
  writeFileSync(
    join(site, 'index.html'),
    `<!DOCTYPE html><html lang="ar" dir="rtl"><head><title>x</title></head><body><div id="root"></div>` +
      `<script type="module">${HYDRATE}</script><script src="/_expo/static/js/web/entry-abc.js" defer></script></body></html>`,
  );
  const admin = mkdtempSync(join(tmpdir(), 'stylo-admin-'));
  writeFileSync(join(admin, 'index.html'), '<!doctype html><html><body><script type="module" src="/admin/assets/a.js"></script></body></html>');
  const a = await buildApp({
    pool,
    config: loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      AUTH_DEV_HEADER: 'true',
      CUSTOMER_WEB_DIR: site,
      ADMIN_WEB_DIR: admin,
      ...env,
    }),
    logger: false,
  });
  apps.push(a);
  return a;
}

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
});

after(async () => {
  for (const a of apps) await a.close();
  await pool?.end();
});

describe('security headers', () => {
  it('customer pages: CSP allows only this server and the hydrate script by its hash', async () => {
    const a = await app();
    const res = await a.inject('/');
    assert.equal(res.statusCode, 200);
    const csp = res.headers['content-security-policy'] as string;
    const hash = createHash('sha256').update(HYDRATE).digest('base64');
    assert.match(csp, /default-src 'self'/);
    assert.ok(csp.includes(`script-src 'self' 'sha256-${hash}'`), csp);
    assert.ok(!/script-src[^;]*unsafe-(inline|eval)/.test(csp), 'no unsafe scripts');
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(res.headers['permissions-policy'] as string, /camera=\(\)/);
  });

  it('back office: strict CSP, noindex; the API: nothing may run or frame it', async () => {
    const a = await app();
    const res = await a.inject('/admin/orders');
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-security-policy'] as string, /script-src 'self';/);
    assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow');
    const api = await a.inject('/v1/categories');
    assert.equal(api.headers['content-security-policy'], "default-src 'none'; frame-ancestors 'none'");
    assert.equal(api.headers['x-content-type-options'], 'nosniff');
  });

  it('JSON-LD and external scripts are not hashed; production upgrades requests, no http images', () => {
    const html = `<script type="application/ld+json">{"a":1}</script><script src="/x.js"></script><script>${HYDRATE}</script>`;
    assert.equal(inlineScriptHashes(html).length, 1);
    const prod = contentSecurityPolicy('', { production: true });
    assert.match(prod, /upgrade-insecure-requests/);
    assert.ok(!prod.includes('http:'));
  });
});

describe('request limits', () => {
  it('are off in tests by default (no limiter in the way of other suites)', async () => {
    const a = await app({ API_MAX_PER_IP_MINUTE: '3' });
    for (let i = 0; i < 5; i++) assert.equal((await a.inject('/v1/categories')).statusCode, 200);
  });

  it('/v1 per IP per minute → 429 with Retry-After and an Arabic message', async () => {
    const a = await app({ RATE_LIMITS: 'true', API_MAX_PER_IP_MINUTE: '3' });
    for (let i = 0; i < 3; i++) assert.equal((await a.inject('/v1/categories')).statusCode, 200);
    const res = await a.inject('/v1/categories');
    assert.equal(res.statusCode, 429);
    assert.equal(res.json().error.code, 'rate_limited');
    assert.ok(Number(res.headers['retry-after']) > 0);
    // Another address is not affected; the websites are not counted.
    assert.equal((await a.inject({ url: '/v1/categories', remoteAddress: '10.0.0.9' })).statusCode, 200);
    assert.equal((await a.inject('/')).statusCode, 200);
  });

  it('sign-in code checks per IP', async () => {
    const a = await app({ RATE_LIMITS: 'true' });
    const verify = () =>
      a.inject({ method: 'POST', url: '/v1/auth/otp/verify', remoteAddress: '10.0.0.20', payload: { phone: '+218910000004', code: '000000' } });
    for (let i = 0; i < 60; i++) assert.notEqual((await verify()).statusCode, 429);
    const res = await verify();
    assert.equal(res.statusCode, 429);
    assert.equal(res.json().error.code, 'otp_verify_limit');
  });

  it('cart sharing per account', async () => {
    const a = await app({ RATE_LIMITS: 'true' });
    const pd = await pool.query(`SELECT id FROM product_variants WHERE stock_qty > 0 LIMIT 1`);
    await a.inject({ method: 'POST', url: '/v1/cart/items', headers: { 'x-user-id': CUSTOMER }, payload: { variantId: pd.rows[0].id, quantity: 1, replaceCart: true } });
    const share = () => a.inject({ method: 'POST', url: '/v1/cart/share', headers: { 'x-user-id': CUSTOMER } });
    for (let i = 0; i < 30; i++) assert.equal((await share()).statusCode, 201);
    assert.equal((await share()).statusCode, 429);
    // Limits are per account: staff uploads still pass the limiter (and fail on the empty body).
    const up = await a.inject({ method: 'POST', url: '/v1/admin/uploads?purpose=banner', headers: { 'x-user-id': OPS, 'content-type': 'image/png' }, payload: Buffer.from('x') });
    assert.notEqual(up.statusCode, 429);
  });
});
