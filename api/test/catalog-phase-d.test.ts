/**
 * Phase D catalog: paging with a total, «ترتيب», size and price filters, Arabic-insensitive search
 * across products / stores / categories, and the facets the filter sheet offers.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';
import { normaliseSearch, sortSizes } from '../src/modules/catalog/catalog.service.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = fileURLToPath(new URL('../../database/', import.meta.url));

let pool: Pool;
let app: FastifyInstance;
type Card = { id: string; name: string; price: number };
const get = async (qs: string) => {
  const res = await app.inject(`/v1/products?${qs}`);
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { items: Card[]; total: number; hasMore: boolean };
};

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
  app = await buildApp({ pool, config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB }), logger: false });
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('paging', () => {
  it('pages carry the total and whether more follow; pages do not overlap', async () => {
    const all = await get('limit=50');
    const p1 = await get('limit=5&offset=0');
    const p2 = await get('limit=5&offset=5');
    assert.equal(p1.total, all.items.length);
    assert.equal(p1.hasMore, true);
    assert.equal(p1.items.length, 5);
    assert.ok(p2.items.every((x) => !p1.items.some((y) => y.id === x.id)));
    const last = await get(`limit=5&offset=${all.items.length - 2}`);
    assert.equal(last.items.length, 2);
    assert.equal(last.hasMore, false);
    assert.equal(last.total, all.items.length);
  });
});

describe('«ترتيب» and filters', () => {
  it('sorts by price both ways', async () => {
    const asc = (await get('limit=50&sort=price_asc')).items.map((x) => x.price);
    const desc = (await get('limit=50&sort=price_desc')).items.map((x) => x.price);
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
  });

  it('price range in dirhams', async () => {
    const r = await get('limit=50&minPrice=100000&maxPrice=200000');
    assert.ok(r.items.length > 0);
    assert.ok(r.items.every((x) => x.price >= 100000 && x.price <= 200000));
  });

  it('sizes: only products with that size in stock', async () => {
    const r = await get('limit=50&sizes=38');
    const names = r.items.map((x) => x.name);
    assert.ok(names.includes('حذاء رياضي أبيض'));
    assert.ok(names.includes('كعب عالي نود'));
    assert.ok(!names.includes('فستان ملفوف عنابي'));
    // Sold out → not listed for that size.
    await pool.query(
      `UPDATE product_variants v SET stock_qty = 0 FROM products p WHERE p.id = v.product_id AND p.name_ar = 'كعب عالي نود' AND v.size = '38'`,
    );
    assert.ok(!(await get('limit=50&sizes=38')).items.some((x) => x.name === 'كعب عالي نود'));
    // Several sizes = any of them.
    const ml = await get('limit=50&sizes=M,L');
    assert.ok(ml.items.some((x) => x.name === 'فستان ملفوف عنابي'));
  });
});

describe('search', () => {
  it('ignores hamza / taa marbuta / alif maqsura differences', async () => {
    assert.equal(normaliseSearch('عبايةٌ أسود'), 'عبايه اسود');
    const r = await get('limit=50&q=عبايه');
    assert.ok(r.items.some((x) => x.name === 'عباية سوداء مطرزة'), JSON.stringify(r.items.map((x) => x.name)));
    assert.ok((await get('limit=50&q=اقراط')).items.some((x) => x.name === 'أقراط ذهبية'));
  });

  it('finds products by their category name, and every word must match', async () => {
    const dresses = await get('limit=50&q=فساتين');
    assert.ok(dresses.items.length > 0);
    assert.ok(dresses.items.some((x) => x.name.includes('فستان')));
    const two = await get(`limit=50&q=${encodeURIComponent('فستان عنابي')}`);
    assert.deepEqual(two.items.map((x) => x.name), ['فستان ملفوف عنابي']);
    assert.equal((await get(`limit=50&q=${encodeURIComponent('فستان رياضي')}`)).total, 0);
  });
});

describe('facets for the filter sheet', () => {
  it('sizes in natural order with counts, and the price range of the same listing', async () => {
    const res = await app.inject('/v1/products/facets?category=shoes');
    assert.equal(res.statusCode, 200, res.body);
    const f = res.json();
    const sizes = f.sizes.map((s: { size: string }) => s.size);
    assert.deepEqual(sizes, [...sizes].sort((a: string, b: string) => Number(a) - Number(b)));
    assert.ok(f.price.min > 0 && f.price.max >= f.price.min);
    assert.deepEqual(
      sortSizes([{ size: 'XL' }, { size: '38' }, { size: 'S' }, { size: 'M' }, { size: '6Y' }, { size: '36' }]).map((s) => s.size),
      ['S', 'M', 'XL', '6Y', '36', '38'], // kids ages (6Y) count as their number
    );
  });
});
