/**
 * Home banners and «كمّل اللوك» managed from the back office.
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
const LAURA_MANAGER = '00000000-0000-0000-0000-000000000008';
const LAURA = '10000000-0000-0000-0000-000000000001';
const FIONA = '10000000-0000-0000-0000-000000000002';
// Laura's products: dress, tote bag, sunglasses, watch, abaya
const DRESS = '30000000-0000-0000-0000-000000000001';
const TOTE = '30000000-0000-0000-0000-000000000002';
const SUNGLASSES = '30000000-0000-0000-0000-000000000004';
const ABAYA = '30000000-0000-0000-0000-000000000012';
const FIONA_CARDIGAN = '30000000-0000-0000-0000-000000000014';
const FEATURED_LOOK = '40000000-0000-0000-0000-000000000001'; // Laura's evening look

let pool: Pool;
let app: FastifyInstance;
let clock = new Date('2026-11-24T10:00:00Z');

function req(user: string | null, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) {
  return app.inject({ method, url, payload: body as object, headers: user ? { 'x-user-id': user } : {} });
}
const home = async () => (await req(null, 'GET', '/v1/home')).json();

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
  app = await buildApp({
    pool,
    config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, AUTH_DEV_HEADER: 'true' }),
    now: () => clock,
    logger: false,
  });
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('banners', () => {
  it('only Stylo staff with banners.manage', async () => {
    assert.equal((await req(OPS, 'GET', '/v1/admin/banners')).statusCode, 200);
    assert.equal((await req(LAURA_OWNER, 'GET', '/v1/admin/banners')).statusCode, 403);
    assert.equal((await req(SUPPORT, 'POST', '/v1/admin/banners', { title: 'تجربة' })).statusCode, 403);
  });

  it('a new banner goes last; the link must open a screen inside the app', async () => {
    let res = await req(OPS, 'POST', '/v1/admin/banners', {
      title: 'تشكيلة العيد',
      subtitle: 'فساتين وعبايات بالدينار الليبي',
      cta: 'اكتشفي',
      link: '/products?category=women-abayas',
    });
    assert.equal(res.statusCode, 201, res.body);
    const b = res.json();
    assert.equal(b.state, 'live');
    const list = (await req(OPS, 'GET', '/v1/admin/banners')).json().items;
    assert.equal(list.at(-1).id, b.id);
    for (const bad of ['https://evil.example', 'javascript:alert(1)', '/admin/', '/products?x=<script>']) {
      res = await req(OPS, 'POST', '/v1/admin/banners', { title: 'رابط خاطئ', link: bad });
      assert.equal(res.statusCode, 400, bad);
    }
  });

  it('home shows live banners in order; hidden, scheduled and expired ones are out', async () => {
    const list = (await req(OPS, 'GET', '/v1/admin/banners')).json().items;
    const eid = list.find((b: { title: string }) => b.title === 'تشكيلة العيد').id;
    // Move it first.
    const ids = [eid, ...list.map((b: { id: string }) => b.id).filter((i: string) => i !== eid)];
    await req(OPS, 'POST', '/v1/admin/banners/reorder', { ids });
    assert.equal((await home()).banners[0].title, 'تشكيلة العيد');

    // Scheduled for tomorrow → not yet on the home screen.
    const tomorrow = new Date(clock.getTime() + 86_400_000).toISOString();
    let res = await req(OPS, 'PATCH', `/v1/admin/banners/${eid}`, { startsAt: tomorrow });
    assert.equal(res.json().state, 'scheduled');
    assert.ok(!(await home()).banners.some((b: { id: string }) => b.id === eid));
    clock = new Date(clock.getTime() + 2 * 86_400_000);
    assert.equal((await home()).banners[0].id, eid);

    // Window end before start is refused; an ended window = expired.
    res = await req(OPS, 'PATCH', `/v1/admin/banners/${eid}`, { endsAt: tomorrow });
    assert.equal(res.json().error.code, 'invalid_window');
    res = await req(OPS, 'PATCH', `/v1/admin/banners/${eid}`, { startsAt: null, endsAt: new Date(clock.getTime() - 1000).toISOString() });
    assert.equal(res.json().state, 'expired');
    res = await req(OPS, 'PATCH', `/v1/admin/banners/${eid}`, { endsAt: null, isActive: false });
    assert.equal(res.json().state, 'hidden');
    assert.ok(!(await home()).banners.some((b: { id: string }) => b.id === eid));
    // PATCH keeps what was not sent.
    assert.equal(res.json().link, '/products?category=women-abayas');

    assert.equal((await req(ADMIN, 'DELETE', `/v1/admin/banners/${eid}`)).statusCode, 200);
    assert.equal((await req(ADMIN, 'DELETE', `/v1/admin/banners/${eid}`)).statusCode, 404);
  });
});

describe('looks («كمّل اللوك»)', () => {
  it('store staff see and manage only their store; support cannot', async () => {
    const owner = (await req(LAURA_OWNER, 'GET', '/v1/admin/looks')).json().items;
    assert.ok(owner.length > 0);
    assert.ok(owner.every((l: { store: { id: string } }) => l.store.id === LAURA));
    const all = (await req(OPS, 'GET', '/v1/admin/looks')).json().items;
    assert.ok(all.length > owner.length);
    assert.equal((await req(SUPPORT, 'GET', '/v1/admin/looks')).statusCode, 403);
    const fionaLook = all.find((l: { store: { id: string } }) => l.store.id === FIONA);
    assert.equal((await req(LAURA_OWNER, 'GET', `/v1/admin/looks/${fionaLook.id}`)).statusCode, 404);
    assert.equal((await req(LAURA_OWNER, 'DELETE', `/v1/admin/looks/${fionaLook.id}`)).statusCode, 404);
  });

  it('a store owner creates a look of 2–8 pieces from their own store, never featured', async () => {
    let res = await req(LAURA_OWNER, 'POST', '/v1/admin/looks', {
      title: 'إطلالة عباية وحقيبة',
      subtitle: 'للمناسبات',
      productIds: [ABAYA, TOTE],
      isFeatured: true, // ignored: Stylo decides
      storeId: FIONA, // ignored: their own store
    });
    assert.equal(res.statusCode, 201, res.body);
    const look = res.json();
    assert.equal(look.store.id, LAURA);
    assert.equal(look.isFeatured, false);
    assert.match(look.slug, /^look-[0-9a-f]{8}$/);
    assert.deepEqual(look.items.map((i: { id: string }) => i.id), [ABAYA, TOTE]);
    assert.equal(look.visibleToCustomers, true);

    res = await req(LAURA_OWNER, 'POST', '/v1/admin/looks', { title: 'قطعة واحدة', productIds: [DRESS] });
    assert.equal(res.json().error.code, 'items_count');
    res = await req(LAURA_OWNER, 'POST', '/v1/admin/looks', { title: 'من متجرين', productIds: [DRESS, FIONA_CARDIGAN] });
    assert.equal(res.json().error.code, 'look_single_store');
    res = await req(LAURA_OWNER, 'POST', '/v1/admin/looks', { title: 'مكرر', productIds: [DRESS, DRESS] });
    assert.equal(res.json().error.code, 'duplicate_items');

    // Customers can open it, and add the whole look to the cart.
    const pub = await req(null, 'GET', `/v1/looks/${look.slug}`);
    assert.equal(pub.statusCode, 200);
    assert.equal(pub.json().items.length, 2);
  });

  it('edits pieces and order; a look with fewer than 2 pieces on sale disappears for customers', async () => {
    const look = (await req(LAURA_OWNER, 'GET', '/v1/admin/looks')).json().items.find(
      (l: { title: string }) => l.title === 'إطلالة عباية وحقيبة',
    );
    let res = await req(LAURA_MANAGER, 'PATCH', `/v1/admin/looks/${look.id}`, { productIds: [TOTE, ABAYA, SUNGLASSES] });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json().items.map((i: { id: string }) => i.id), [TOTE, ABAYA, SUNGLASSES]);
    assert.equal(res.json().title, 'إطلالة عباية وحقيبة');

    // Archive two of the three pieces → only one on sale → hidden from customers.
    await pool.query(`UPDATE products SET status = 'archived' WHERE id = ANY($1::uuid[])`, [[ABAYA, SUNGLASSES]]);
    assert.equal((await req(null, 'GET', `/v1/looks/${look.slug}`)).statusCode, 404);
    res = await req(LAURA_OWNER, 'GET', `/v1/admin/looks/${look.id}`);
    assert.equal(res.json().visibleToCustomers, false);
    assert.match(res.json().hiddenReason, /أقل من 2/);
    await pool.query(`UPDATE products SET status = 'active' WHERE id = ANY($1::uuid[])`, [[ABAYA, SUNGLASSES]]);
    assert.equal((await req(null, 'GET', `/v1/looks/${look.slug}`)).statusCode, 200);
  });

  it('Stylo staff feature a look on the home screen; store staff cannot', async () => {
    const mine = (await req(LAURA_OWNER, 'GET', '/v1/admin/looks')).json().items.find(
      (l: { title: string }) => l.title === 'إطلالة عباية وحقيبة',
    );
    let res = await req(LAURA_OWNER, 'PATCH', `/v1/admin/looks/${mine.id}`, { isFeatured: true });
    assert.equal(res.json().isFeatured, false);
    assert.equal((await req(LAURA_OWNER, 'POST', '/v1/admin/looks/reorder', { ids: [mine.id] })).statusCode, 403);

    await req(OPS, 'PATCH', `/v1/admin/looks/${FEATURED_LOOK}`, { isFeatured: false });
    res = await req(OPS, 'PATCH', `/v1/admin/looks/${mine.id}`, { isFeatured: true });
    assert.equal(res.json().isFeatured, true);
    assert.equal((await home()).featuredLook.id, mine.id);

    // Hidden → off the home screen.
    await req(OPS, 'PATCH', `/v1/admin/looks/${mine.id}`, { isActive: false });
    assert.notEqual((await home()).featuredLook?.id, mine.id);
  });

  it('deletes a look (owner, own store)', async () => {
    const mine = (await req(LAURA_OWNER, 'GET', '/v1/admin/looks')).json().items.find(
      (l: { title: string }) => l.title === 'إطلالة عباية وحقيبة',
    );
    assert.equal((await req(LAURA_OWNER, 'DELETE', `/v1/admin/looks/${mine.id}`)).statusCode, 200);
    assert.equal((await req(LAURA_OWNER, 'GET', `/v1/admin/looks/${mine.id}`)).statusCode, 404);
  });
});
