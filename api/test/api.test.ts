/**
 * Integration tests: real PostgreSQL (TEST_DATABASE_URL, default stylo_test), fixed clock.
 * The schema is rebuilt from database/migrations + dev seed before the run.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';
import { quoteDelivery, splitFee } from '../src/modules/delivery/delivery.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = new URL('../../database/', import.meta.url).pathname;
// 10:00 in Libya (UTC+2) — inside the delivery window, so same-city orders can arrive today.
const NOW = new Date('2026-11-23T08:00:00Z');

const SARA = '00000000-0000-0000-0000-000000000004'; // Tripoli
const MARYAM = '00000000-0000-0000-0000-000000000005'; // Benghazi
const DRESS_M = 'LAU-WRP-BRG-M'; // أزياء لورا
const TOTE = 'FIO-TOT-BEI'; // متجر فيونا

let pool: Pool;
let app: FastifyInstance;
const variantIds: Record<string, string> = {};

async function resetDatabase(p: Pool) {
  await p.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await p.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await p.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
}

function req(method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', url: string, body?: unknown, user = SARA) {
  return app.inject({ method, url: `/v1${url}`, payload: body as object, headers: { 'x-user-id': user } });
}

before(async () => {
  pool = createPool(TEST_DB);
  await resetDatabase(pool);
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, DEV_USER_ID: SARA });
  app = await buildApp({ pool, config, now: () => NOW, logger: false });
  const { rows } = await pool.query('SELECT id, sku FROM product_variants');
  for (const r of rows) variantIds[r.sku] = r.id;
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('delivery rules (pure)', () => {
  const cfg = loadConfig({ NODE_ENV: 'test' }).delivery;

  it('fastest = sum of store fees; unified = one flat fee, only for 2+ stores', () => {
    const q = quoteDelivery(
      [
        { storeId: 'a', city: 'طرابلس', prepHours: 3, deliveryFee: 10000 },
        { storeId: 'b', city: 'بنغازي', prepHours: 5, deliveryFee: 15000 },
      ],
      'طرابلس',
      NOW,
      cfg,
    );
    assert.equal(q.fastest.fee, 25000);
    assert.equal(q.fastest.shipments, 2);
    assert.equal(q.fastest.perStore[0]!.dayOffset, 0); // same city, 3h prep + 3h transit → today
    assert.equal(q.fastest.perStore[1]!.dayOffset, 1); // intercity → tomorrow
    assert.equal(q.unified.available, true);
    assert.equal(q.unified.fee, cfg.unifiedFee);
    assert.equal(q.unified.shipments, 1);
    assert.equal(q.unified.savings, 25000 - cfg.unifiedFee);
    assert.ok(q.unified.arrivesAt! >= q.fastest.arrivesAt!);

    const single = quoteDelivery([{ storeId: 'a', city: 'طرابلس', prepHours: 3, deliveryFee: 10000 }], 'طرابلس', NOW, cfg);
    assert.equal(single.unified.available, false);
  });

  it('splitFee keeps the exact total', () => {
    assert.deepEqual(splitFee(15000, 2), [7500, 7500]);
    assert.deepEqual(splitFee(10000, 3), [3334, 3333, 3333]);
  });
});

describe('catalog', () => {
  it('GET /home returns banners, a featured look and featured stores', async () => {
    const res = await req('GET', '/home');
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.banners[0].title, 'إطلالتك تبدأ من هنا');
    assert.equal(body.featuredLook.items.length, 4);
    assert.equal(body.featuredLook.storeCount, 4);
    assert.deepEqual(
      body.featuredStores.map((s: { logoText: string }) => s.logoText).sort(),
      ['Chic', 'LUNA', 'NOVA', 'VELA'],
    );
  });

  it('feeds order products differently and prices are LYD dirhams', async () => {
    const trending = (await req('GET', '/products?feed=trending&limit=1')).json().items[0];
    const fresh = (await req('GET', '/products?feed=new&limit=1')).json().items[0];
    assert.equal(trending.name, 'حذاء رياضي أبيض');
    assert.equal(fresh.name, 'قلادة لؤلؤ');
    assert.equal(trending.currency, 'LYD');
    assert.equal(trending.price, 199000);
    assert.equal(trending.delivery.dayOffset, 0); // Tripoli store → Tripoli customer, today
  });

  it('search matches product and store names', async () => {
    const items = (await req('GET', `/products?q=${encodeURIComponent('فيونا')}`)).json().items;
    assert.ok(items.length >= 2);
    assert.ok(items.every((p: { store: { name: string } }) => p.store.name === 'متجر فيونا'));
  });

  it('product detail has variants and "كمّل اللوك" suggestions', async () => {
    const dressId = '30000000-0000-0000-0000-000000000001';
    const product = (await req('GET', `/products/${dressId}`)).json();
    assert.equal(product.variants.length, 3);
    const look = (await req('GET', `/products/${dressId}/complete-the-look`)).json().items;
    assert.deepEqual(
      look.map((p: { name: string }) => p.name),
      ['حقيبة يد بيج', 'نظارة شمسية سوداء', 'ساعة ذهبية كلاسيكية'],
    );
  });

  it('rejects malformed ids with 400 and unknown ids with 404', async () => {
    assert.equal((await req('GET', '/products/not-a-uuid')).statusCode, 400);
    assert.equal((await req('GET', '/products/30000000-0000-0000-0000-000000000999')).statusCode, 404);
  });
});

describe('multi-store cart, sharing and checkout', () => {
  it('groups the cart by store and quotes both delivery modes', async () => {
    await req('POST', '/cart/items', { variantId: variantIds[DRESS_M], quantity: 2 });
    const res = await req('POST', '/cart/items', { variantId: variantIds[TOTE] });
    assert.equal(res.statusCode, 200);
    const cart = res.json();
    assert.equal(cart.storeCount, 2);
    assert.equal(cart.itemsCount, 3);
    assert.equal(cart.subtotal, 2 * 199000 + 249000);
    assert.equal(cart.delivery.fastest.fee, 20000);
    assert.equal(cart.delivery.unified.available, true);
    assert.equal(cart.delivery.unified.fee, 15000);
    assert.equal(cart.totals.unified, cart.subtotal + 15000);
  });

  it('refuses quantities above stock with 409', async () => {
    const res = await req('PATCH', `/cart/items/${variantIds[DRESS_M]}`, { quantity: 13 });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, 'insufficient_stock');
  });

  it('shares the cart and another user imports it', async () => {
    const share = await req('POST', '/cart/share');
    assert.equal(share.statusCode, 201);
    const { token, url } = share.json();
    assert.match(url, /^stylo:\/\/shared-cart\//);

    const opened = (await req('GET', `/shared-carts/${token}`, undefined, MARYAM)).json();
    assert.equal(opened.sharedBy, 'سارة');
    assert.equal(opened.cart.itemsCount, 3);

    const imported = (await req('POST', `/shared-carts/${token}/import`, undefined, MARYAM)).json();
    assert.equal(imported.itemsCount, 3);
    // Maryam is in Benghazi: Tripoli stores now take an intercity trip.
    assert.ok(imported.groups.every((g: { fastestShipment: { dayOffset: number } }) => g.fastestShipment.dayOffset >= 1));
    await req('DELETE', '/cart', undefined, MARYAM);
  });

  it('checks out with unified delivery: one order per store, stock decremented, cart emptied', async () => {
    const before = await pool.query('SELECT stock_qty FROM product_variants WHERE sku = $1', [DRESS_M]);
    const res = await req('POST', '/checkout', { deliveryMode: 'unified' });
    assert.equal(res.statusCode, 201, res.body);
    const result = res.json();
    assert.equal(result.orders.length, 2);
    assert.equal(result.deliveryFee, 15000);
    assert.equal(
      result.orders.reduce((s: number, o: { shippingFee: number }) => s + o.shippingFee, 0),
      15000,
    );
    assert.equal(result.total, 2 * 199000 + 249000 + 15000);

    const after = await pool.query('SELECT stock_qty FROM product_variants WHERE sku = $1', [DRESS_M]);
    assert.equal(after.rows[0].stock_qty, before.rows[0].stock_qty - 2);
    assert.equal((await req('GET', '/cart')).json().itemsCount, 0);

    const orders = (await req('GET', '/orders')).json().items;
    assert.equal(orders.length, 2);
    assert.ok(orders.every((o: { status: string; deliveryMode: string }) => o.status === 'pending' && o.deliveryMode === 'unified'));

    const detail = (await req('GET', `/orders/${orders[0].id}`)).json();
    assert.deepEqual(detail.history.map((h: { to: string }) => h.to), ['pending']);
    assert.ok(detail.items.length >= 1);
  });

  it('unified delivery is refused for a single-store cart', async () => {
    await req('POST', '/cart/items', { variantId: variantIds[TOTE] });
    const res = await req('POST', '/checkout', { deliveryMode: 'unified' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'delivery_mode_unavailable');
    await req('DELETE', '/cart');
  });

  it('adds a whole look to the cart', async () => {
    const res = await req('POST', '/looks/evening-burgundy/add-to-cart');
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().cart.storeCount, 4);
    await req('DELETE', '/cart');
  });

  it('users cannot read other users orders', async () => {
    const orders = (await req('GET', '/orders')).json().items;
    const res = await req('GET', `/orders/${orders[0].id}`, undefined, MARYAM);
    assert.equal(res.statusCode, 404);
  });
});
