/**
 * Phone + one-time-code sign-in (customers, staff, store owners) and store payouts.
 * No dev header here: every request is authenticated with a real bearer token.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = fileURLToPath(new URL('../../database/', import.meta.url));

let pool: Pool;
let app: FastifyInstance;
// A movable clock so cooldowns and expiry can be tested.
let clock = new Date('2026-11-24T08:00:00Z');
const tick = (seconds: number) => (clock = new Date(clock.getTime() + seconds * 1000));

const LAURA = '10000000-0000-0000-0000-000000000001';

function call(method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown, token?: string) {
  return app.inject({
    method,
    url,
    payload: body as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

/** Full sign-in: request a code (echoed in dev), verify it. */
async function signIn(phone: string, app: 'customer' | 'admin', fullName?: string): Promise<string> {
  tick(60);
  const req = await call('POST', '/v1/auth/otp/request', { phone });
  assert.equal(req.statusCode, 200, req.body);
  const res = await call('POST', '/v1/auth/otp/verify', { phone, code: req.json().devCode, app, fullName });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().token;
}

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
  app = await buildApp({
    pool,
    // No AUTH_DEV_HEADER: x-user-id is ignored.
    config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB }),
    now: () => clock,
    logger: false,
  });
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('phone sign-in', () => {
  it('the dev x-user-id header no longer works', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/cart',
      headers: { 'x-user-id': '00000000-0000-0000-0000-000000000004' },
    });
    assert.equal(res.statusCode, 401);
  });

  it('rejects invalid Libyan numbers', async () => {
    const res = await call('POST', '/v1/auth/otp/request', { phone: '0812345678' });
    assert.equal(res.json().error.code, 'invalid_phone');
  });

  it('existing customer signs in (Arabic-Indic digits accepted) and uses the cart', async () => {
    tick(60);
    const r = await call('POST', '/v1/auth/otp/request', { phone: '٠٩١٠٠٠٠٠٠٤' });
    const { devCode, phone, expiresInSeconds } = r.json();
    assert.equal(phone, '+218910000004');
    assert.equal(expiresInSeconds, 300);
    assert.match(devCode, /^\d{6}$/);
    const stored = await pool.query(`SELECT code_hash FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1`, [phone]);
    assert.notEqual(stored.rows[0].code_hash, devCode); // only a hash is stored

    const v = (await call('POST', '/v1/auth/otp/verify', { phone: '0910000004', code: devCode })).json();
    assert.equal(v.user.fullName, 'سارة أحمد');
    const cart = await call('GET', '/v1/cart', undefined, v.token);
    assert.equal(cart.statusCode, 200);
    const me = (await call('GET', '/v1/me', undefined, v.token)).json();
    assert.equal(me.phone, '+218910000004');
  });

  it('enforces the resend cooldown', async () => {
    tick(60);
    await call('POST', '/v1/auth/otp/request', { phone: '0910000004' });
    const again = await call('POST', '/v1/auth/otp/request', { phone: '0910000004' });
    assert.equal(again.statusCode, 429);
    assert.equal(again.json().error.code, 'otp_cooldown');
  });

  it('wrong codes count down and lock after 5 attempts; codes expire', async () => {
    tick(60);
    const { devCode } = (await call('POST', '/v1/auth/otp/request', { phone: '0920000005' })).json();
    const wrong = devCode === '000000' ? '111111' : '000000';
    let res = await call('POST', '/v1/auth/otp/verify', { phone: '0920000005', code: wrong });
    assert.equal(res.json().error.code, 'invalid_code');
    for (let i = 0; i < 4; i++) await call('POST', '/v1/auth/otp/verify', { phone: '0920000005', code: wrong });
    res = await call('POST', '/v1/auth/otp/verify', { phone: '0920000005', code: devCode });
    assert.equal(res.json().error.code, 'too_many_attempts');

    tick(60);
    const fresh = (await call('POST', '/v1/auth/otp/request', { phone: '0920000005' })).json();
    tick(301);
    res = await call('POST', '/v1/auth/otp/verify', { phone: '0920000005', code: fresh.devCode });
    assert.equal(res.json().error.code, 'code_expired');
  });

  it('a new number becomes a customer after giving a name (same code)', async () => {
    tick(60);
    const { devCode } = (await call('POST', '/v1/auth/otp/request', { phone: '0947654321' })).json();
    let res = await call('POST', '/v1/auth/otp/verify', { phone: '0947654321', code: devCode });
    assert.equal(res.json().error.code, 'name_required');
    res = await call('POST', '/v1/auth/otp/verify', { phone: '0947654321', code: devCode, fullName: 'آمنة سالم' });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().user.role, 'customer');
  });

  it('the back office only admits active staff', async () => {
    tick(60);
    const { devCode } = (await call('POST', '/v1/auth/otp/request', { phone: '0910000004' })).json();
    const res = await call('POST', '/v1/auth/otp/verify', { phone: '0910000004', code: devCode, app: 'admin' });
    assert.equal(res.statusCode, 403);

    const ownerToken = await signIn('0910000002', 'admin'); // نورة — مالكة «أزياء لورا»
    const me = (await call('GET', '/v1/admin/me', undefined, ownerToken)).json();
    assert.equal(me.role.key, 'store_owner');
    assert.equal(me.store.id, LAURA);
  });

  it('logout revokes the session', async () => {
    const token = await signIn('0910000004', 'customer');
    assert.equal((await call('POST', '/v1/auth/logout', undefined, token)).statusCode, 200);
    assert.equal((await call('GET', '/v1/cart', undefined, token)).statusCode, 401);
  });
});

describe('store payouts', () => {
  let admin = '';
  let owner = '';
  let payoutId = '';

  before(async () => {
    admin = await signIn('0910000001', 'admin');
    owner = await signIn('0910000002', 'admin');
  });

  it('balances list what each store is owed (delivered, unsettled)', async () => {
    const items = (await call('GET', '/v1/admin/payouts/balances', undefined, admin)).json().items;
    const laura = items.find((b: { storeId: string }) => b.storeId === LAURA);
    const db = await pool.query(
      `SELECT count(*)::int AS n, COALESCE(SUM(subtotal - commission_amount),0)::bigint AS payout
         FROM orders WHERE store_id = $1 AND status = 'delivered'`,
      [LAURA],
    );
    assert.equal(laura.unsettled.orders, db.rows[0].n);
    assert.equal(laura.unsettled.payout, db.rows[0].payout);
    // Store owners only see their own store.
    const mine = (await call('GET', '/v1/admin/payouts/balances', undefined, owner)).json().items;
    assert.deepEqual(
      mine.map((b: { storeId: string }) => b.storeId),
      [LAURA],
    );
  });

  it('settles a period once, then marks it paid with a reference', async () => {
    const from = '2026-01-01';
    const to = '2026-12-31';
    const preview = (await call('GET', `/v1/admin/payouts/preview?storeId=${LAURA}&from=${from}&to=${to}`, undefined, admin)).json();
    assert.ok(preview.ordersCount > 0);
    assert.equal(preview.payout, preview.sales - preview.commission);

    const created = await call('POST', '/v1/admin/payouts', { storeId: LAURA, from, to, note: 'تسوية تجريبية' }, admin);
    assert.equal(created.statusCode, 201, created.body);
    const p = created.json();
    payoutId = p.id;
    assert.equal(p.status, 'pending');
    assert.equal(p.ordersCount, preview.ordersCount);
    assert.equal(p.payoutAmount, preview.payout);
    assert.equal(p.orders.length, preview.ordersCount);

    // The same orders can't be settled twice.
    const again = await call('POST', '/v1/admin/payouts', { storeId: LAURA, from, to }, admin);
    assert.equal(again.json().error.code, 'nothing_to_settle');

    const paid = (await call('POST', `/v1/admin/payouts/${payoutId}/paid`, { reference: 'TRX-12345' }, admin)).json();
    assert.equal(paid.status, 'paid');
    assert.equal(paid.reference, 'TRX-12345');
    assert.equal(paid.paidBy, 'مدير ستايلو');
    assert.equal((await call('DELETE', `/v1/admin/payouts/${payoutId}`, undefined, admin)).statusCode, 409);
  });

  it('store owners read their payout history but cannot create or pay', async () => {
    const list = (await call('GET', '/v1/admin/payouts', undefined, owner)).json().items;
    assert.equal(list.length, 1);
    assert.equal(list[0].store.id, LAURA);
    const res = await call('POST', '/v1/admin/payouts', { storeId: LAURA, from: '2026-01-01', to: '2026-12-31' }, owner);
    assert.equal(res.statusCode, 403);
  });

  it('a pending payout can be cancelled and its orders settled again', async () => {
    const chic = '10000000-0000-0000-0000-000000000006';
    const created = (await call('POST', '/v1/admin/payouts', { storeId: chic, from: '2026-01-01', to: '2026-12-31' }, admin)).json();
    assert.equal((await call('DELETE', `/v1/admin/payouts/${created.id}`, undefined, admin)).statusCode, 200);
    const preview = (await call('GET', `/v1/admin/payouts/preview?storeId=${chic}&from=2026-01-01&to=2026-12-31`, undefined, admin)).json();
    assert.equal(preview.ordersCount, created.ordersCount);
  });
});
