/**
 * Delivery coverage (migration 0015, owner decision: Tripoli only at launch).
 * - Stores outside the served cities are hidden from customers everywhere (lists, pages, looks,
 *   categories, sitemap) and their items cannot be added.
 * - An order needs the address in a served city and in the store's own city, otherwise the cart
 *   explains why and checkout answers 409 with the same Arabic message.
 * - Opening a city is one row in service_cities.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';
import { citiesText } from '../src/lib/coverage.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = fileURLToPath(new URL('../../database/', import.meta.url));
const SARA = '00000000-0000-0000-0000-000000000004'; // Tripoli address
const MARYAM = '00000000-0000-0000-0000-000000000005'; // Benghazi address
const ADMIN = '00000000-0000-0000-0000-000000000001';

let pool: Pool;
let app: FastifyInstance;
const sku: Record<string, string> = {};
let velaProduct = '';

function req(method: 'GET' | 'POST' | 'DELETE', url: string, user?: string, body?: unknown) {
  return app.inject({ method, url: `/v1${url}`, payload: body as object, headers: user ? { 'x-user-id': user } : {} });
}

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
  app = await buildApp({
    pool,
    config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, AUTH_DEV_HEADER: 'true' }),
    logger: false,
  });
  for (const r of (await pool.query(`SELECT id, sku FROM product_variants`)).rows) sku[r.sku] = r.id;
  velaProduct = (await pool.query(`SELECT product_id FROM product_variants WHERE sku = 'VEL-PRL-WHT'`)).rows[0].product_id;
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('Tripoli only (launch)', () => {
  it('the served cities are listed with every address city', async () => {
    const body = (await req('GET', '/cities')).json();
    assert.deepEqual(body.served, ['طرابلس']);
    assert.ok(body.items.includes('بنغازي'));
    assert.equal(citiesText(['طرابلس', 'بنغازي', 'مصراتة']), 'طرابلس، بنغازي ومصراتة');
  });

  it('stores outside Tripoli are hidden from customers everywhere', async () => {
    const stores = (await req('GET', '/stores')).json().items.map((s: { slug: string }) => s.slug);
    assert.ok(!stores.includes('vela') && !stores.includes('nova'));
    assert.ok(stores.includes('laura'));
    assert.equal((await req('GET', '/stores/vela')).statusCode, 404);
    assert.equal((await req('GET', `/products/${velaProduct}`)).statusCode, 404);
    const all = (await req('GET', '/products?limit=50')).json().items;
    assert.ok(all.every((p: { store: { city: string } }) => p.store.city === 'طرابلس'));
    const looks = (await req('GET', '/looks')).json().items;
    assert.ok(looks.every((l: { store: { slug: string } }) => !['vela', 'nova'].includes(l.store.slug)));
    const sitemap = (await app.inject('/sitemap.xml')).body;
    assert.ok(!sitemap.includes('/store/vela') && !sitemap.includes(velaProduct));
    const added = await req('POST', '/cart/items', SARA, { variantId: sku['VEL-PRL-WHT'], replaceCart: true });
    assert.equal(added.statusCode, 409);
    assert.equal(added.json().error.code, 'unavailable');
  });

  it('an address outside Tripoli: no «يصلك…», a note on the product, the cart says why, checkout refused', async () => {
    const laura = (await pool.query(`SELECT product_id FROM product_variants WHERE sku = 'LAU-SUN-BLK'`)).rows[0].product_id;
    const product = (await req('GET', `/products/${laura}`, MARYAM)).json();
    assert.equal(product.delivery, null);
    assert.match(product.coverageNote, /طرابلس فقط/);
    assert.match(product.coverageNote, /بنغازي/);
    // Sara (Tripoli) sees the delivery estimate and no note.
    const mine = (await req('GET', `/products/${laura}`, SARA)).json();
    assert.ok(mine.delivery);
    assert.equal(mine.coverageNote, null);

    await req('DELETE', '/cart', MARYAM);
    const cart = (await req('POST', '/cart/items', MARYAM, { variantId: sku['LAU-SUN-BLK'], replaceCart: true })).json();
    assert.equal(cart.coverage.code, 'outside_coverage');
    assert.deepEqual(cart.coverage.servedCities, ['طرابلس']);
    const res = await req('POST', '/checkout', MARYAM, { deliveryMode: 'standard' });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, 'outside_coverage');
    assert.equal(res.json().error.message, cart.coverage.message);
    assert.equal(res.json().error.details.city, 'بنغازي');
    // Nothing was ordered: the cart is still there.
    assert.equal((await req('GET', '/cart', MARYAM)).json().itemsCount, 1);
  });

  it('a Tripoli address orders from a Tripoli store as before', async () => {
    await req('DELETE', '/cart', SARA);
    const cart = (await req('POST', '/cart/items', SARA, { variantId: sku['LAU-SUN-BLK'], replaceCart: true })).json();
    assert.equal(cart.coverage, null);
    const res = await req('POST', '/checkout', SARA, { deliveryMode: 'standard' });
    assert.equal(res.statusCode, 201, res.body);
  });

  it('the back office shows which stores are outside the delivery area', async () => {
    const me = (await req('GET', '/admin/me', ADMIN)).json();
    assert.deepEqual(me.serviceCities, ['طرابلس']);
    const stores = (await req('GET', '/admin/stores', ADMIN)).json().items as { slug: string; inServiceArea: boolean }[];
    assert.equal(stores.find((s) => s.slug === 'vela')!.inServiceArea, false);
    assert.equal(stores.find((s) => s.slug === 'laura')!.inServiceArea, true);
  });
});

describe('opening another city later (one row)', () => {
  before(async () => {
    await pool.query(`INSERT INTO service_cities (city) VALUES ('بنغازي')`);
  });

  it('its stores appear; each store delivers inside its own city only (no intercity yet)', async () => {
    assert.equal((await req('GET', '/stores/vela')).statusCode, 200);
    // Sara (Tripoli) can see Vela but not order from it: the cart explains.
    const card = (await req('GET', `/products/${velaProduct}`, SARA)).json();
    assert.equal(card.delivery, null);
    await req('DELETE', '/cart', SARA);
    const cart = (await req('POST', '/cart/items', SARA, { variantId: sku['VEL-PRL-WHT'], replaceCart: true })).json();
    assert.equal(cart.coverage.code, 'store_other_city');
    assert.match(cart.coverage.message, /داخل بنغازي فقط/);
    const res = await req('POST', '/checkout', SARA, { deliveryMode: 'standard' });
    assert.equal(res.json().error.code, 'store_other_city');
    // Maryam (Benghazi) orders from Vela.
    await req('DELETE', '/cart', MARYAM);
    const hers = (await req('POST', '/cart/items', MARYAM, { variantId: sku['VEL-PRL-WHT'], replaceCart: true })).json();
    assert.equal(hers.coverage, null);
    assert.equal((await req('POST', '/checkout', MARYAM, { deliveryMode: 'standard' })).statusCode, 201);
  });
});
