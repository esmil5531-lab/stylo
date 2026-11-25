/**
 * «التقييمات»: only customers who received a product can rate it; the product rating follows;
 * the author shows as «first name + initial»; Stylo staff (not stores) can hide abusive reviews.
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
const OPS = '00000000-0000-0000-0000-000000000006';
const LAURA_OWNER = '00000000-0000-0000-0000-000000000002';

let pool: Pool;
let app: FastifyInstance;
let buyer = '';
let other = '';
let product = '';

function req(user: string | null, method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, body?: unknown) {
  return app.inject({ method, url, payload: body as object, headers: user ? { 'x-user-id': user } : {} });
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
  // A customer with a delivered order, one of its products, and a customer who never bought it.
  const r = await pool.query(
    `SELECT o.customer_id, v.product_id FROM orders o JOIN order_items oi ON oi.order_id = o.id
       JOIN product_variants v ON v.id = oi.variant_id
      WHERE o.status = 'delivered' LIMIT 1`,
  );
  buyer = r.rows[0].customer_id;
  product = r.rows[0].product_id;
  other = (
    await pool.query(`INSERT INTO users (full_name, phone, role) VALUES ('ريم', '+218919876543', 'customer') RETURNING id`)
  ).rows[0].id;
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('reviews', () => {
  it('only a customer who received the product may rate it', async () => {
    let res = await req(other, 'PUT', `/v1/products/${product}/reviews/mine`, { rating: 5 });
    assert.equal(res.statusCode, 403);
    assert.equal((await req(other, 'GET', `/v1/products/${product}/reviews`)).json().canReview, false);
    res = await req(buyer, 'GET', `/v1/products/${product}/reviews`);
    assert.equal(res.json().canReview, true);
    assert.equal(res.json().mine, null);
    assert.equal((await req(buyer, 'PUT', `/v1/products/${product}/reviews/mine`, { rating: 6 })).statusCode, 400);
  });

  it('a review sets the product rating; editing replaces it; the author is first name + initial', async () => {
    let res = await req(buyer, 'PUT', `/v1/products/${product}/reviews/mine`, { rating: 4, body: '  جودة ممتازة والمقاس مضبوط  ' });
    assert.equal(res.statusCode, 200, res.body);
    let p = (await req(null, 'GET', `/v1/products/${product}`)).json();
    assert.equal(p.rating, 4);
    assert.equal(p.ratingCount, 1);
    res = await req(buyer, 'PUT', `/v1/products/${product}/reviews/mine`, { rating: 5, body: 'رائعة' });
    const list = res.json();
    assert.equal(list.summary.count, 1);
    assert.equal(list.summary.average, 5);
    assert.equal(list.summary.distribution['5'], 1);
    assert.equal(list.mine.rating, 5);
    assert.equal(list.items[0].body, 'رائعة');
    const name = (await pool.query(`SELECT full_name FROM users WHERE id = $1`, [buyer])).rows[0].full_name as string;
    const parts = name.split(/\s+/);
    assert.equal(list.items[0].author, parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : parts[0]);
    assert.ok(!JSON.stringify(list.items).includes('+218'), 'no phone numbers in public reviews');
    p = (await req(null, 'GET', `/v1/products/${product}`)).json();
    assert.equal(p.rating, 5);
  });

  it('Stylo staff hide an abusive review (rating recomputed); stores cannot moderate', async () => {
    assert.equal((await req(LAURA_OWNER, 'GET', '/v1/admin/reviews')).statusCode, 403);
    const admin = (await req(OPS, 'GET', '/v1/admin/reviews')).json();
    const id = admin.items.find((r: { product: { id: string } }) => r.product.id === product).id;
    let res = await req(OPS, 'POST', `/v1/admin/reviews/${id}/visibility`, { hidden: true });
    assert.equal(res.statusCode, 200, res.body);
    const pub = (await req(null, 'GET', `/v1/products/${product}/reviews`)).json();
    assert.equal(pub.summary.count, 0);
    assert.equal(pub.items.length, 0);
    assert.equal((await req(null, 'GET', `/v1/products/${product}`)).json().ratingCount, 0);
    // She still sees that her review is hidden.
    assert.equal((await req(buyer, 'GET', `/v1/products/${product}/reviews`)).json().mine.hidden, true);
    res = await req(OPS, 'POST', `/v1/admin/reviews/${id}/visibility`, { hidden: false });
    assert.equal((await req(null, 'GET', `/v1/products/${product}`)).json().ratingCount, 1);
  });

  it('she can delete her own review', async () => {
    assert.equal((await req(buyer, 'DELETE', `/v1/products/${product}/reviews/mine`)).statusCode, 200);
    assert.equal((await req(null, 'GET', `/v1/products/${product}`)).json().ratingCount, 0);
    assert.equal((await req(buyer, 'DELETE', `/v1/products/${product}/reviews/mine`)).statusCode, 404);
  });
});
