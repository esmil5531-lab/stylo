/**
 * Integration tests: real PostgreSQL (TEST_DATABASE_URL, default stylo_test), fixed clock.
 * The schema is rebuilt from database/migrations + dev seed before the run.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';
import { quoteDelivery } from '../src/modules/delivery/delivery.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = fileURLToPath(new URL('../../database/', import.meta.url));
// 10:00 in Libya (UTC+2) — inside the delivery window, so same-city orders can arrive today.
const NOW = new Date('2026-11-23T08:00:00Z');

const SARA = '00000000-0000-0000-0000-000000000004'; // Tripoli
const MARYAM = '00000000-0000-0000-0000-000000000005'; // Benghazi
const DRESS_M = 'LAU-WRP-BRG-M'; // أزياء لورا
const SUNGLASSES = 'LAU-SUN-BLK'; // أزياء لورا
const HEELS_38 = 'CHC-HEL-NUD-38'; // شيك

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
  const config = loadConfig({ NODE_ENV: 'test', AUTH_DEV_HEADER: 'true', DATABASE_URL: TEST_DB, DEV_USER_ID: SARA });
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

  it('fastest = store fee + express surcharge and arrives first; standard = store fee only', () => {
    const q = quoteDelivery({ city: 'طرابلس', prepHours: 3, deliveryFee: 10000 }, 'طرابلس', NOW, cfg);
    assert.equal(q.fastest.fee, 10000 + cfg.expressSurcharge);
    assert.equal(q.standard.fee, 10000);
    assert.equal(q.fastest.dayOffset, 0); // 3h prep + 3h transit → today
    assert.equal(q.standard.dayOffset, 1); // next regular round → tomorrow
    assert.ok(q.fastest.arrivesAt < q.standard.arrivesAt);
  });

  it('intercity shipments cannot arrive today', () => {
    const q = quoteDelivery({ city: 'طرابلس', prepHours: 3, deliveryFee: 10000 }, 'بنغازي', NOW, cfg);
    assert.equal(q.fastest.dayOffset, 1);
  });
});

describe('catalog', () => {
  it('GET /home returns banners, a single-store featured look and featured stores', async () => {
    const body = (await req('GET', '/home')).json();
    assert.equal(body.banners[0].title, 'إطلالتك تبدأ من هنا');
    assert.equal(body.featuredLook.store.slug, 'laura');
    assert.equal(body.featuredLook.items.length, 4);
    assert.ok(body.featuredLook.items.every((p: { store: { slug: string } }) => p.store.slug === 'laura'));
    assert.deepEqual(
      body.featuredStores.map((s: { logoText: string }) => s.logoText).sort(),
      ['Chic', 'LAURA', 'LUNA', 'NOVA', 'VELA'],
    );
  });

  it('"عروض" feed lists only discounted products, biggest discount first, in LYD', async () => {
    const items = (await req('GET', '/products?feed=offers&limit=50')).json().items;
    assert.equal(items.length, 10);
    assert.ok(items.every((p: { compareAtPrice: number; price: number }) => p.compareAtPrice > p.price));
    const discounts = items.map((p: { discountPercent: number }) => p.discountPercent);
    assert.deepEqual(discounts, [...discounts].sort((a, b) => b - a));
    assert.equal(items[0].name, 'فستان ملفوف عنابي');
    assert.equal(items[0].discountPercent, 23);
    assert.equal(items[0].currency, 'LYD');
  });

  it('trending and search', async () => {
    const trending = (await req('GET', '/products?feed=trending&limit=1')).json().items[0];
    assert.equal(trending.name, 'حذاء رياضي أبيض');
    assert.equal(trending.delivery.dayOffset, 0);
    const found = (await req('GET', `/products?q=${encodeURIComponent('فيونا')}`)).json().items;
    assert.equal(found.length, 3);
  });

  it('"كمّل اللوك" suggestions come from the same store', async () => {
    const look = (await req('GET', '/products/30000000-0000-0000-0000-000000000001/complete-the-look')).json().items;
    assert.deepEqual(
      look.map((p: { name: string }) => p.name),
      ['حقيبة يد بيج', 'نظارة شمسية سوداء', 'ساعة ذهبية كلاسيكية'],
    );
    assert.ok(look.every((p: { store: { slug: string } }) => p.store.slug === 'laura'));
  });

  it('rejects malformed ids with 400 and unknown ids with 404', async () => {
    assert.equal((await req('GET', '/products/not-a-uuid')).statusCode, 400);
    assert.equal((await req('GET', '/products/30000000-0000-0000-0000-000000000999')).statusCode, 404);
  });
});

describe('single-store cart', () => {
  it('builds a cart for one store with both delivery options', async () => {
    await req('POST', '/cart/items', { variantId: variantIds[DRESS_M], quantity: 2 });
    const cart = (await req('POST', '/cart/items', { variantId: variantIds[SUNGLASSES] })).json();
    assert.equal(cart.store.slug, 'laura');
    assert.equal(cart.itemsCount, 3);
    assert.equal(cart.subtotal, 2 * 199000 + 89000);
    assert.equal(cart.delivery.fastest.fee, 15000);
    assert.equal(cart.delivery.standard.fee, 10000);
    assert.equal(cart.totals.standard, cart.subtotal + 10000);
  });

  it('refuses an item from another store with cart_store_conflict and keeps the cart', async () => {
    const res = await req('POST', '/cart/items', { variantId: variantIds[HEELS_38] });
    assert.equal(res.statusCode, 409);
    const err = res.json().error;
    assert.equal(err.code, 'cart_store_conflict');
    assert.equal(err.details.currentStore.slug, 'laura');
    assert.equal(err.details.requestedStore.slug, 'chic');
    assert.equal(err.details.itemsCount, 3);
    assert.equal((await req('GET', '/cart')).json().store.slug, 'laura');
  });

  it('replaceCart starts a new cart from the other store', async () => {
    const cart = (await req('POST', '/cart/items', { variantId: variantIds[HEELS_38], replaceCart: true })).json();
    assert.equal(cart.store.slug, 'chic');
    assert.equal(cart.itemsCount, 1);
  });

  it('the database itself refuses mixed-store carts', async () => {
    await assert.rejects(
      pool.query('INSERT INTO cart_items (user_id, variant_id, quantity) VALUES ($1, $2, 1)', [
        SARA,
        variantIds[DRESS_M],
      ]),
      /cart_single_store|belongs to store/,
    );
  });

  it('refuses quantities above stock with 409', async () => {
    const res = await req('PATCH', `/cart/items/${variantIds[HEELS_38]}`, { quantity: 6 });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, 'insufficient_stock');
  });

  it('removing the last item frees the cart from its store', async () => {
    const cart = (await req('DELETE', `/cart/items/${variantIds[HEELS_38]}`)).json();
    assert.equal(cart.store, null);
    assert.equal(cart.delivery, null);
    const ok = await req('POST', '/cart/items', { variantId: variantIds[DRESS_M] });
    assert.equal(ok.json().store.slug, 'laura');
  });
});

describe('looks, sharing and checkout', () => {
  it('adding a look from another store needs replaceCart', async () => {
    await req('DELETE', '/cart');
    await req('POST', '/cart/items', { variantId: variantIds[HEELS_38] });
    const refused = await req('POST', '/looks/evening-burgundy/add-to-cart', {});
    assert.equal(refused.statusCode, 409);
    assert.equal(refused.json().error.code, 'cart_store_conflict');

    const res = await req('POST', '/looks/evening-burgundy/add-to-cart', { replaceCart: true });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().cart.store.slug, 'laura');
    assert.equal(res.json().cart.items.length, 4);
  });

  it('shares a single-store cart; importing it into another store cart needs replaceCart', async () => {
    const { token } = (await req('POST', '/cart/share')).json();
    const opened = (await req('GET', `/shared-carts/${token}`, undefined, MARYAM)).json();
    assert.equal(opened.sharedBy, 'سارة');
    assert.equal(opened.cart.store.slug, 'laura');

    await req('POST', '/cart/items', { variantId: variantIds['VEL-PRL-WHT'] }, MARYAM);
    const refused = await req('POST', `/shared-carts/${token}/import`, {}, MARYAM);
    assert.equal(refused.statusCode, 409);

    const imported = (await req('POST', `/shared-carts/${token}/import`, { replaceCart: true }, MARYAM)).json();
    assert.equal(imported.store.slug, 'laura');
    assert.equal(imported.items.length, 4);
    // Maryam is in Benghazi: a Tripoli store cannot deliver today.
    assert.equal(imported.delivery.fastest.dayOffset, 1);
  });

  it('checks out one order for the store, decrements stock and empties the cart', async () => {
    const before = await pool.query("SELECT SUM(stock_qty)::int AS stock_qty FROM product_variants WHERE product_id = '30000000-0000-0000-0000-000000000001'");
    const res = await req('POST', '/checkout', { deliveryMode: 'standard' });
    assert.equal(res.statusCode, 201, res.body);
    const order = res.json();
    assert.equal(order.store.slug, 'laura');
    assert.equal(order.deliveryFee, 10000);
    assert.equal(order.total, 199000 + 249000 + 89000 + 320000 + 10000);

    const after = await pool.query("SELECT SUM(stock_qty)::int AS stock_qty FROM product_variants WHERE product_id = '30000000-0000-0000-0000-000000000001'");
    assert.equal(after.rows[0].stock_qty, before.rows[0].stock_qty - 1);
    assert.equal((await req('GET', '/cart')).json().itemsCount, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM carts WHERE user_id = $1', [SARA])).rows[0].n, 0);

    const orders = (await req('GET', '/orders')).json().items;
    const mine = orders.find((o: { id: string }) => o.id === order.id);
    assert.equal(mine.deliveryMode, 'standard');
    assert.equal(mine.status, 'pending');
    const detail = (await req('GET', `/orders/${order.id}`)).json();
    assert.deepEqual(detail.history.map((h: { to: string }) => h.to), ['pending']);
    assert.equal(detail.items.length, 4);
  });

  it('retired multi-store "unified" delivery is rejected', async () => {
    await req('POST', '/cart/items', { variantId: variantIds[DRESS_M] });
    const res = await req('POST', '/checkout', { deliveryMode: 'unified' });
    assert.equal(res.statusCode, 400);
    await req('DELETE', '/cart');
  });

  it('users cannot read other users orders', async () => {
    const orders = (await req('GET', '/orders')).json().items;
    assert.equal((await req('GET', `/orders/${orders[0].id}`, undefined, MARYAM)).statusCode, 404);
  });
});
