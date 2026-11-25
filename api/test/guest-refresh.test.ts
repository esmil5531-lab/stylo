/**
 * Phase B sign-in: guests shop without an account, the code is asked once (refresh tokens),
 * the guest cart follows the customer into her account, and one phone = one account.
 * No dev header: every request carries a real bearer token.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';
import { purgeIdleGuests } from '../src/modules/auth/auth.service.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = fileURLToPath(new URL('../../database/', import.meta.url));

let pool: Pool;
let app: FastifyInstance;
let clock = new Date('2026-11-25T08:00:00Z');
const tick = (seconds: number) => (clock = new Date(clock.getTime() + seconds * 1000));
const variant: Record<string, string> = {};

function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown, token?: string) {
  return app.inject({ method, url, payload: body as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
}

async function verify(phone: string, token?: string, fullName = 'سلمى التاجوري') {
  tick(60);
  const req = await call('POST', '/v1/auth/otp/request', { phone });
  assert.equal(req.statusCode, 200, req.body);
  const res = await call('POST', '/v1/auth/otp/verify', { phone, code: req.json().devCode, fullName }, token);
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
  const { rows } = await pool.query(`SELECT id, sku FROM product_variants`);
  for (const r of rows) variant[r.sku] = r.id;
  app = await buildApp({ pool, config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB }), now: () => clock, logger: false });
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('guests', () => {
  let guest: { token: string; refreshToken: string; user: { id: string } };

  it('a guest session needs no phone: favourites and cart work', async () => {
    const res = await call('POST', '/v1/auth/guest');
    assert.equal(res.statusCode, 201, res.body);
    guest = res.json();
    assert.ok(guest.token && guest.refreshToken);
    let r = await call('POST', '/v1/cart/items', { variantId: variant['LAU-WRP-BRG-M'], quantity: 2 }, guest.token);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().itemsCount, 2);
    // Same single-store rule as for accounts.
    r = await call('POST', '/v1/cart/items', { variantId: variant['CHC-HEL-NUD-38'] }, guest.token);
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().error.code, 'cart_store_conflict');
    const products = (await call('GET', '/v1/products?limit=1')).json().items;
    r = await call('PUT', `/v1/wishlist/${products[0].id}`, undefined, guest.token);
    assert.ok([200, 201, 204].includes(r.statusCode), r.body);
  });

  it('checkout, orders, addresses and the account need a verified phone', async () => {
    for (const [m, url] of [
      ['POST', '/v1/checkout'],
      ['GET', '/v1/orders'],
      ['GET', '/v1/me/addresses'],
      ['GET', '/v1/me'],
      ['GET', '/v1/me/notifications'],
    ] as const) {
      const r = await call(m, url, m === 'POST' ? { deliveryMode: 'standard' } : undefined, guest.token);
      assert.equal(r.statusCode, 401, url);
      assert.equal(r.json().error.code, 'sign_in_required', url);
    }
  });

  it('signing in carries the guest cart and favourites into the account; the guest is deleted', async () => {
    // Sara (seed, Tripoli) already has… let her cart be from another store first.
    const sara = await verify('0910000004');
    await call('DELETE', '/v1/cart', undefined, sara.token);
    await call('POST', '/v1/cart/items', { variantId: variant['CHC-HEL-NUD-38'] }, sara.token);

    const res = await verify('+218 91 000 0004', guest.token);
    assert.equal(res.mergedGuestCart, true);
    assert.equal(res.user.id, sara.user.id, 'same account whatever the number format');
    const cart = (await call('GET', '/v1/cart', undefined, res.token)).json();
    // The guest cart (newest intent) replaced the cart from the other store.
    assert.equal(cart.itemsCount, 2);
    assert.equal(cart.items[0].variantId, variant['LAU-WRP-BRG-M']);
    const wl = (await call('GET', '/v1/wishlist', undefined, res.token)).json().items;
    assert.ok(wl.length >= 1);
    assert.equal((await pool.query(`SELECT 1 FROM users WHERE id = $1`, [guest.user.id])).rowCount, 0);
    // The old guest token is dead.
    assert.equal((await call('GET', '/v1/cart', undefined, guest.token)).statusCode, 401);
  });

  it('same store: the quantities add up', async () => {
    const g = (await call('POST', '/v1/auth/guest')).json();
    await call('POST', '/v1/cart/items', { variantId: variant['LAU-WRP-BRG-M'] }, g.token);
    const res = await verify('91 000 0004', g.token);
    const cart = (await call('GET', '/v1/cart', undefined, res.token)).json();
    assert.equal(cart.items.find((i: { variantId: string }) => i.variantId === variant['LAU-WRP-BRG-M']).quantity, 3);
  });

  it('idle guests are cleaned up after 30 days', async () => {
    const g = (await call('POST', '/v1/auth/guest')).json();
    assert.equal(await purgeIdleGuests(pool, clock, 30), 0);
    assert.ok((await purgeIdleGuests(pool, new Date(clock.getTime() + 31 * 86_400_000), 30)) >= 1);
    assert.equal((await pool.query(`SELECT 1 FROM users WHERE id = $1`, [g.user.id])).rowCount, 0);
  });
});

describe('the code is asked once: refresh tokens', () => {
  let s: { token: string; refreshToken: string };

  it('verify returns an access token (24 h) and a refresh token (180 days)', async () => {
    s = await verify('0920000005');
    assert.ok(s.refreshToken);
    assert.equal((await call('GET', '/v1/me', undefined, s.token)).statusCode, 200);
  });

  it('after a day the access token expires; the refresh token renews both, no code', async () => {
    tick(25 * 3600);
    assert.equal((await call('GET', '/v1/me', undefined, s.token)).statusCode, 401);
    const r = await call('POST', '/v1/auth/refresh', { refreshToken: s.refreshToken });
    assert.equal(r.statusCode, 200, r.body);
    const next = r.json();
    assert.notEqual(next.refreshToken, s.refreshToken);
    assert.equal((await call('GET', '/v1/me', undefined, next.token)).statusCode, 200);

    // A lost response retried at once with the old token still works (grace)…
    const retry = await call('POST', '/v1/auth/refresh', { refreshToken: s.refreshToken });
    assert.equal(retry.statusCode, 200, retry.body);
    s = retry.json();
  });

  it('…but a rotated token replayed later revokes the session (copied token)', async () => {
    const old = s.refreshToken;
    const r = await call('POST', '/v1/auth/refresh', { refreshToken: old });
    assert.equal(r.statusCode, 200);
    const current = r.json();
    tick(120);
    const replay = await call('POST', '/v1/auth/refresh', { refreshToken: old });
    assert.equal(replay.statusCode, 401);
    assert.equal(replay.json().error.code, 'session_expired');
    // Everything of that session is gone, including the newest pair.
    assert.equal((await call('GET', '/v1/me', undefined, current.token)).statusCode, 401);
    assert.equal((await call('POST', '/v1/auth/refresh', { refreshToken: current.refreshToken })).statusCode, 401);
  });

  it('back-office sessions have no refresh token', async () => {
    tick(60);
    const req = await call('POST', '/v1/auth/otp/request', { phone: '0910000001' });
    const res = await call('POST', '/v1/auth/otp/verify', { phone: '0910000001', code: req.json().devCode, app: 'admin' });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().refreshToken, undefined);
  });
});

describe('one phone = one account', () => {
  it('every Libyan format reaches the same account; the database refuses unnormalised numbers', async () => {
    const ids = new Set<string>();
    for (const p of ['0945556667', '945556667', '+218945556667', '00218945556667', '٠٩٤٥٥٥٦٦٦٧']) {
      ids.add((await verify(p)).user.id);
    }
    assert.equal(ids.size, 1);
    await assert.rejects(
      pool.query(`INSERT INTO users (full_name, phone, role) VALUES ('x', '0945556668', 'customer')`),
      /users_phone_format/,
    );
  });
});

describe('«حذف حسابي» (account deletion)', () => {
  it('refused while an order is on its way; then erases personal data, the number can sign up again', async () => {
    const me = await verify('0951112233', undefined, 'هند');
    const t = me.token;
    const addr = await call('POST', '/v1/me/addresses', {
      recipientName: 'هند', phone: '0951112233', city: 'طرابلس', district: 'قرقارش', street: 'شارع 1', landmark: 'قرب الجامع',
    }, t);
    assert.equal(addr.statusCode, 201, addr.body);
    await call('POST', '/v1/cart/items', { variantId: variant['LAU-WRP-BRG-M'] }, t);
    const order = await call('POST', '/v1/checkout', { deliveryMode: 'standard' }, t);
    assert.equal(order.statusCode, 201, order.body);

    let res = await call('DELETE', '/v1/me', undefined, t);
    assert.equal(res.json().error.code, 'active_orders');
    await call('POST', `/v1/orders/${order.json().id}/cancel`, {}, t);

    res = await call('DELETE', '/v1/me', undefined, t);
    assert.equal(res.statusCode, 200, res.body);
    const u = (await pool.query(`SELECT full_name, phone, deleted_at FROM users WHERE id = $1`, [me.user.id])).rows[0];
    assert.deepEqual([u.full_name, u.phone, u.deleted_at !== null], ['حساب محذوف', null, true]);
    assert.equal((await pool.query(`SELECT 1 FROM addresses WHERE user_id = $1`, [me.user.id])).rowCount, 0);
    const o = (await pool.query(`SELECT shipping_address FROM orders WHERE id = $1`, [order.json().id])).rows[0];
    assert.deepEqual(o.shipping_address, { city: 'طرابلس', recipient_name: 'حساب محذوف' });
    assert.equal((await call('GET', '/v1/cart', undefined, t)).statusCode, 401);
    assert.equal((await call('POST', '/v1/auth/refresh', { refreshToken: me.refreshToken })).statusCode, 401);

    // Same number later: a new, empty account.
    const again = await verify('0951112233', undefined, 'هند');
    assert.notEqual(again.user.id, me.user.id);
  });

  it('staff accounts are not deleted from the app', async () => {
    const res = await verify('0910000001');
    const del = await call('DELETE', '/v1/me', undefined, res.token);
    assert.equal(del.statusCode, 403);
  });
});
