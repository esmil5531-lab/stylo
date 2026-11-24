/**
 * Store self-management (لوحة المتجر), products & sizes, reports & commission.
 * Rebuilds TEST_DATABASE_URL; test files run one at a time (see package.json).
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = new URL('../../database/', import.meta.url).pathname;
const NOW = new Date('2026-11-23T08:00:00Z');

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OPS = '00000000-0000-0000-0000-000000000006';
const LAURA_OWNER = '00000000-0000-0000-0000-000000000002';
const CUSTOMER = '00000000-0000-0000-0000-000000000004';
const LAURA = '10000000-0000-0000-0000-000000000001';
const CHIC = '10000000-0000-0000-0000-000000000006';
const WOMEN = '20000000-0000-0000-0000-000000000001';

let pool: Pool;
let app: FastifyInstance;

function req(user: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, body?: unknown) {
  return app.inject({ method, url, payload: body as object, headers: { 'x-user-id': user } });
}

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
  app = await buildApp({
    pool,
    config: loadConfig({ NODE_ENV: 'test', AUTH_DEV_HEADER: 'true', DATABASE_URL: TEST_DB }),
    now: () => NOW,
    logger: false,
  });
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('store owner panel', () => {
  it('the owner signs in as «مالك المتجر» scoped to their store', async () => {
    const me = (await req(LAURA_OWNER, 'GET', '/v1/admin/me')).json();
    assert.equal(me.role.key, 'store_owner');
    assert.equal(me.store.id, LAURA);
    assert.ok(me.permissions.includes('products.write'));
    assert.ok(!me.permissions.includes('stores.write'));
  });

  it('edits its own settings (Arabic-Indic digits accepted) but not fee/commission/status', async () => {
    const res = await req(LAURA_OWNER, 'PATCH', '/v1/admin/my-store', {
      phone: '٠٩١٢٣٤٥٦٧٨',
      prepHours: 5,
      district: 'حي الأندلس',
      deliveryFee: 1, // not part of the store profile: ignored
      commissionBps: 0, // idem
    });
    assert.equal(res.statusCode, 200, res.body);
    const store = res.json().store;
    assert.equal(store.phone, '+218912345678');
    assert.equal(store.prepHours, 5);
    assert.equal(store.deliveryFee, 10000);
    assert.equal(store.commissionBps, 1200);
  });

  it('cannot reach the platform-wide store list for other stores', async () => {
    const list = (await req(LAURA_OWNER, 'GET', '/v1/admin/stores')).statusCode;
    assert.equal(list, 403);
  });
});

describe('products & sizes', () => {
  let productId = '';

  it('lists only the store’s own products', async () => {
    const items = (await req(LAURA_OWNER, 'GET', '/v1/admin/products')).json().items;
    assert.ok(items.length >= 5);
    assert.ok(items.every((p: { store: { id: string } }) => p.store.id === LAURA));
  });

  it('creates a product with sizes, auto SKUs, and ignores "featured" from store staff', async () => {
    const res = await req(LAURA_OWNER, 'POST', '/v1/admin/products', {
      categoryId: WOMEN,
      nameAr: 'جاكيت تويد',
      nameEn: 'Tweed Jacket',
      basePrice: 310000,
      compareAtPrice: 360000,
      status: 'active',
      isFeatured: true,
      variants: [
        { size: 'S', colorName: 'كحلي', colorHex: '#1F2A44', stock: 3 },
        { size: 'M', colorName: 'كحلي', colorHex: '#1F2A44', stock: 5 },
        { size: 'L', colorName: 'كحلي', colorHex: '#1F2A44', stock: 0 },
      ],
    });
    assert.equal(res.statusCode, 201, res.body);
    const p = res.json();
    productId = p.id;
    assert.equal(p.store.id, LAURA);
    assert.equal(p.isFeatured, false);
    assert.deepEqual(
      p.variants.map((v: { size: string }) => v.size),
      ['S', 'M', 'L'],
    );
    assert.ok(p.variants.every((v: { sku: string }) => /^LAU-[0-9A-F]{6}$/.test(v.sku)));
    assert.equal(p.stockTotal, 8);
  });

  it('validates sizes and prices', async () => {
    const base = { nameAr: 'منتج', basePrice: 100000, status: 'draft' };
    let r = await req(LAURA_OWNER, 'POST', '/v1/admin/products', {
      ...base,
      variants: [{ size: 'M', stock: 1 }, { size: 'M', stock: 2 }],
    });
    assert.equal(r.json().error.code, 'duplicate_variant');
    r = await req(LAURA_OWNER, 'POST', '/v1/admin/products', {
      ...base,
      compareAtPrice: 90000,
      variants: [{ size: 'M', stock: 1 }],
    });
    assert.equal(r.json().error.code, 'invalid_compare_price');
    r = await req(LAURA_OWNER, 'POST', '/v1/admin/products', { ...base, variants: [] });
    assert.equal(r.statusCode, 400);
    r = await req(LAURA_OWNER, 'POST', '/v1/admin/products', {
      ...base,
      storeId: CHIC,
      variants: [{ size: 'M', stock: 1 }],
    });
    assert.equal(r.statusCode, 403);
  });

  it('updates stock, removes a size, adds XL — in the chosen order', async () => {
    const current = (await req(LAURA_OWNER, 'GET', `/v1/admin/products/${productId}`)).json();
    const [s, m] = current.variants;
    const res = await req(LAURA_OWNER, 'PUT', `/v1/admin/products/${productId}`, {
      categoryId: WOMEN,
      nameAr: 'جاكيت تويد',
      nameEn: 'Tweed Jacket',
      basePrice: 290000,
      compareAtPrice: 360000,
      status: 'active',
      variants: [
        { id: s.id, size: 'S', colorName: 'كحلي', colorHex: '#1F2A44', sku: s.sku, stock: 4 },
        { id: m.id, size: 'M', colorName: 'كحلي', colorHex: '#1F2A44', sku: m.sku, stock: 6 },
        { size: 'XL', colorName: 'كحلي', colorHex: '#1F2A44', stock: 2 },
      ],
    });
    assert.equal(res.statusCode, 200, res.body);
    const p = res.json();
    assert.deepEqual(
      p.variants.map((v: { size: string; stock: number }) => `${v.size}:${v.stock}`),
      ['S:4', 'M:6', 'XL:2'],
    );
    assert.equal(p.variants[0].sku, s.sku);

    // Customers see the same sizes, in the same order, with the discount.
    const pub = (await req(CUSTOMER, 'GET', `/v1/products/${productId}`)).json();
    assert.deepEqual(
      pub.variants.map((v: { size: string }) => v.size),
      ['S', 'M', 'XL'],
    );
    assert.equal(pub.discountPercent, 19);
  });
});

describe('reports & commission', () => {
  it('admin report: totals match the database and the daily series covers the range', async () => {
    const r = (await req(ADMIN, 'GET', '/v1/admin/reports?from=2026-10-25&to=2026-11-23')).json();
    assert.equal(r.range.days, 30);
    assert.equal(r.daily.length, 30);
    const db = await pool.query(
      `SELECT COALESCE(SUM(subtotal),0)::bigint AS sales, COALESCE(SUM(commission_amount),0)::bigint AS commission
         FROM orders WHERE status <> 'cancelled'
          AND (placed_at AT TIME ZONE 'Africa/Tripoli')::date BETWEEN '2026-10-25' AND '2026-11-23'`,
    );
    assert.equal(r.summary.sales, db.rows[0].sales);
    assert.equal(r.summary.commission, db.rows[0].commission);
    assert.equal(r.summary.storePayout, r.summary.sales - r.summary.commission);
    assert.equal(r.summary.styloRevenue, r.summary.commission + r.summary.deliveryFees);
    assert.equal(
      r.byStore.reduce((s: number, x: { sales: number }) => s + x.sales, 0),
      r.summary.sales,
    );
  });

  it('store report is scoped to the store', async () => {
    const r = (await req(LAURA_OWNER, 'GET', '/v1/admin/reports')).json();
    assert.equal(r.byStore.length, 1);
    assert.equal(r.byStore[0].storeId, LAURA);
    // Even if another store is requested.
    const r2 = (await req(LAURA_OWNER, 'GET', `/v1/admin/reports?storeId=${CHIC}`)).json();
    assert.equal(r2.byStore[0].storeId, LAURA);
  });

  it('only finance (stores.commission) can change a commission rate', async () => {
    assert.equal((await req(OPS, 'PATCH', `/v1/admin/stores/${CHIC}`, { commissionBps: 500 })).statusCode, 403);
    const ok = await req(ADMIN, 'PATCH', `/v1/admin/stores/${CHIC}`, { commissionBps: 1500 });
    assert.equal(ok.json().commissionBps, 1500);
  });

  it('orders keep the rate at checkout even if the store rate changes later', async () => {
    const heels = await pool.query(`SELECT id FROM product_variants WHERE sku = 'CHC-HEL-NUD-39'`);
    await req(CUSTOMER, 'POST', '/v1/cart/items', { variantId: heels.rows[0].id, replaceCart: true });
    const order = (await req(CUSTOMER, 'POST', '/v1/checkout', { deliveryMode: 'standard' })).json();
    await req(ADMIN, 'PATCH', `/v1/admin/stores/${CHIC}`, { commissionBps: 800 });
    const row = await pool.query(`SELECT commission_bps, commission_amount, subtotal FROM orders WHERE id = $1`, [
      order.id,
    ]);
    assert.equal(row.rows[0].commission_bps, 1500);
    assert.equal(row.rows[0].commission_amount, Math.round((row.rows[0].subtotal * 1500) / 10000));
  });
});
