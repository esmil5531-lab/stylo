/**
 * Categories (الأقسام): the customer tree, filtering by a main category, hiding, and managing them
 * from the back office.
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
const ADMIN = '00000000-0000-0000-0000-000000000001';
const OPS = '00000000-0000-0000-0000-000000000006';
const SUPPORT = '00000000-0000-0000-0000-000000000007';
const LAURA_OWNER = '00000000-0000-0000-0000-000000000002';
const CUSTOMER = '00000000-0000-0000-0000-000000000004';
const LAURA = '10000000-0000-0000-0000-000000000001';

let pool: Pool;
let app: FastifyInstance;

function req(user: string | null, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', url: string, body?: unknown) {
  return app.inject({ method, url, payload: body as object, headers: user ? { 'x-user-id': user } : {} });
}

interface Node {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  productCount: number;
  children: Node[];
}
const tree = async (): Promise<Node[]> => (await req(null, 'GET', '/v1/categories')).json().items;
const adminList = async (user = ADMIN) => (await req(user, 'GET', '/v1/admin/categories')).json().items;
const bySlug = async (slug: string) => (await adminList()).find((c: { slug: string }) => c.slug === slug);

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
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('customer category tree', () => {
  it('main categories in order, each with its sub-categories, icon and colour', async () => {
    const t = await tree();
    // «عناية وجمال» has no product on sale in the seed: customers don't see an empty shelf.
    assert.deepEqual(
      t.map((c) => c.slug),
      ['women', 'men', 'kids', 'bags', 'shoes', 'accessories', 'watches'],
    );
    const women = t[0]!;
    assert.equal(women.name, 'نساء');
    assert.equal(women.icon, 'hanger');
    assert.match(women.color!, /^#[0-9A-F]{6}$/i);
    assert.equal(women.children[0]!.name, 'فساتين');
    const all = t.flatMap((c) => [c, ...c.children]);
    assert.ok(all.every((c) => c.productCount > 0), 'no empty category for customers');
    // The back office still lists every category, empty ones included.
    const admin = await adminList();
    assert.ok(admin.some((c: { slug: string }) => c.slug === 'care'));
  });

  it("a main category counts and lists its sub-categories' products", async () => {
    const women = (await tree())[0]!;
    const dresses = women.children.find((c) => c.slug === 'women-dresses')!;
    assert.equal(dresses.productCount, 2);
    assert.equal(women.productCount, women.children.reduce((s, c) => s + c.productCount, 0));
    const all = (await req(null, 'GET', '/v1/products?category=women&limit=50')).json().items;
    assert.equal(all.length, women.productCount);
    const only = (await req(null, 'GET', '/v1/products?category=women-dresses')).json().items;
    assert.deepEqual(only.map((p: { name: string }) => p.name).sort(), ['فستان سهرة ساتان', 'فستان ملفوف عنابي']);
    // Cards keep the main category slug (placeholder tile) and get the sub-category icon.
    assert.equal(only[0].category, 'women');
    assert.equal(only[0].categoryIcon, 'hanger');
    const sneakers = (await req(null, 'GET', '/v1/products?category=shoes-sneakers')).json().items;
    assert.equal(sneakers[0].categoryIcon, 'shoe-sneaker');
  });
});

describe('managing categories (back office)', () => {
  it('who may manage: general manager and operations; store owners only read visible ones', async () => {
    assert.ok((await adminList(OPS)).length > 0);
    assert.equal((await req(SUPPORT, 'POST', '/v1/admin/categories', { nameAr: 'تجربة' })).statusCode, 403);
    assert.equal((await req(LAURA_OWNER, 'POST', '/v1/admin/categories', { nameAr: 'تجربة' })).statusCode, 403);
    const ownerList = await adminList(LAURA_OWNER);
    assert.ok(ownerList.every((c: { isActive: boolean }) => c.isActive));
    assert.equal((await req(CUSTOMER, 'GET', '/v1/admin/categories')).statusCode, 403);
  });

  it('adds a sub-category: slug from the English name, last in its list, icon from the list only', async () => {
    const women = await bySlug('women');
    let res = await req(OPS, 'POST', '/v1/admin/categories', {
      nameAr: 'ملابس نوم',
      nameEn: 'Sleepwear',
      parentId: women.id,
      icon: 'hanger',
    });
    assert.equal(res.statusCode, 201, res.body);
    const c = res.json();
    assert.equal(c.slug, 'women-sleepwear');
    assert.equal(c.parentId, women.id);
    const siblings = (await adminList()).filter((x: { parentId: string }) => x.parentId === women.id);
    assert.equal(siblings.at(-1).id, c.id);

    res = await req(OPS, 'POST', '/v1/admin/categories', { nameAr: 'خطأ', icon: 'rocket-launch' });
    assert.equal(res.statusCode, 400);
    res = await req(OPS, 'POST', '/v1/admin/categories', { nameAr: 'مستوى ثالث', parentId: c.id });
    assert.equal(res.json().error.code, 'invalid_parent');
    res = await req(OPS, 'POST', '/v1/admin/categories', { nameAr: 'مكرر', slug: 'women-sleepwear' });
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error.message, /الرابط المختصر/);
  });

  it('edits only what is sent; a main category with sub-categories cannot become a sub-category', async () => {
    const c = await bySlug('women-sleepwear');
    const res = await req(ADMIN, 'PATCH', `/v1/admin/categories/${c.id}`, { nameAr: 'بيجامات وملابس نوم', color: '#A85C76' });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().nameAr, 'بيجامات وملابس نوم');
    assert.equal(res.json().icon, 'hanger');
    assert.equal(res.json().isActive, true);
    const men = await bySlug('men');
    const women = await bySlug('women');
    const bad = await req(ADMIN, 'PATCH', `/v1/admin/categories/${women.id}`, { parentId: men.id });
    assert.equal(bad.json().error.code, 'invalid_parent');
  });

  it('hiding: a hidden sub-category disappears for customers; hiding a main category hides its tree', async () => {
    const dresses = await bySlug('women-dresses');
    await req(ADMIN, 'PATCH', `/v1/admin/categories/${dresses.id}`, { isActive: false });
    let women = (await tree())[0]!;
    assert.ok(!women.children.some((c) => c.slug === 'women-dresses'));
    assert.equal((await req(null, 'GET', '/v1/products?category=women-dresses')).json().items.length, 0);
    // The main category's count matches what it lists (the hidden sub-category's products are out).
    const listed = (await req(null, 'GET', '/v1/products?category=women&limit=50')).json().items;
    assert.equal(women.productCount, listed.length);
    assert.ok(!listed.some((p: { name: string }) => p.name === 'فستان ملفوف عنابي'));

    // A product cannot be filed in a hidden category (but keeps it on unrelated edits).
    const product = (await req(LAURA_OWNER, 'GET', '/v1/admin/products/30000000-0000-0000-0000-000000000001')).json();
    const body = {
      storeId: LAURA,
      categoryId: product.category.id,
      nameAr: product.nameAr,
      basePrice: product.basePrice,
      status: product.status,
      variants: product.variants.map((v: Record<string, unknown>) => ({
        id: v.id,
        size: v.size,
        colorName: v.colorName,
        colorHex: v.colorHex,
        sku: v.sku,
        stock: v.stock,
      })),
    };
    assert.equal((await req(LAURA_OWNER, 'PUT', `/v1/admin/products/${product.id}`, body)).statusCode, 200);
    const create = await req(LAURA_OWNER, 'POST', '/v1/admin/products', {
      ...body,
      nameAr: 'فستان جديد',
      variants: [{ size: 'M', stock: 3 }],
    });
    assert.equal(create.json().error.code, 'category_hidden');

    const w = await bySlug('women');
    await req(ADMIN, 'PATCH', `/v1/admin/categories/${w.id}`, { isActive: false });
    assert.ok(!(await tree()).some((c) => c.slug === 'women'));
    assert.equal((await req(null, 'GET', '/v1/products?category=women-abayas')).json().items.length, 0);
    await req(ADMIN, 'PATCH', `/v1/admin/categories/${w.id}`, { isActive: true });
    await req(ADMIN, 'PATCH', `/v1/admin/categories/${dresses.id}`, { isActive: true });
    women = (await tree())[0]!;
    assert.ok(women.children.some((c) => c.slug === 'women-dresses'));
  });

  it('reorders main categories (all of one level, once each)', async () => {
    const mains = (await adminList()).filter((c: { parentId: string | null }) => !c.parentId);
    const ids = mains.map((c: { id: string }) => c.id);
    const watches = mains.find((c: { slug: string }) => c.slug === 'watches').id;
    const next = [watches, ...ids.filter((i: string) => i !== watches)];
    const res = await req(OPS, 'POST', '/v1/admin/categories/reorder', { parentId: null, ids: next });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await tree())[0]!.slug, 'watches');
    assert.equal(
      (await req(OPS, 'POST', '/v1/admin/categories/reorder', { parentId: null, ids: next.slice(1) })).json().error.code,
      'invalid_order',
    );
  });

  it('deletes only empty categories', async () => {
    const women = await bySlug('women');
    assert.equal((await req(ADMIN, 'DELETE', `/v1/admin/categories/${women.id}`)).json().error.code, 'category_has_children');
    const dresses = await bySlug('women-dresses');
    assert.equal(
      (await req(ADMIN, 'DELETE', `/v1/admin/categories/${dresses.id}`)).json().error.code,
      'category_has_products',
    );
    const sleep = await bySlug('women-sleepwear');
    assert.equal((await req(ADMIN, 'DELETE', `/v1/admin/categories/${sleep.id}`)).statusCode, 200);
    assert.equal(await bySlug('women-sleepwear'), undefined);
  });

  it('sitemap and category pages only list visible categories', async () => {
    const hats = await bySlug('acc-hats');
    await req(ADMIN, 'PATCH', `/v1/admin/categories/${hats.id}`, { isActive: false });
    const xml = (await app.inject('/sitemap.xml')).body;
    assert.ok(xml.includes('category=acc-jewelry'));
    assert.ok(!xml.includes('category=acc-hats'));
  });
});
