/**
 * «عناويني» (customer addresses), «تعديل الاسم», and a brand-new customer placing a first order.
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
const SARA = '00000000-0000-0000-0000-000000000004'; // has one address (طرابلس)
const MARYAM = '00000000-0000-0000-0000-000000000005';
const DRESS = '30000000-0000-0000-0000-000000000001'; // أزياء لورا, طرابلس

let pool: Pool;
let app: FastifyInstance;
let newbie: string; // a customer created with no address

function req(user: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) {
  return app.inject({ method, url, payload: body as object, headers: { 'x-user-id': user } });
}

const home = {
  label: 'البيت',
  recipientName: 'آمنة سالم',
  phone: '٠٩١٧٦٥٤٣٢١',
  city: 'طرابلس',
  district: 'حي الأندلس',
  street: 'شارع قرقارش',
  building: 'عمارة 4، الدور الثاني',
  landmark: 'قرب جامع الصحابة',
};

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
  const u = await pool.query(
    `INSERT INTO users (full_name, phone, role) VALUES ('آمنة', '+218917654321', 'customer') RETURNING id`,
  );
  newbie = u.rows[0].id;
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('a new customer without an address', () => {
  it('cannot check out yet (address_required)', async () => {
    const product = (await req(newbie, 'GET', `/v1/products/${DRESS}`)).json();
    const variant = product.variants.find((v: { stock: number }) => v.stock > 0);
    assert.equal((await req(newbie, 'POST', '/v1/cart/items', { variantId: variant.id })).statusCode, 200);
    const res = await req(newbie, 'POST', '/v1/checkout', { deliveryMode: 'standard' });
    assert.equal(res.json().error.code, 'address_required');
    const me = (await req(newbie, 'GET', '/v1/me')).json();
    assert.equal(me.defaultAddress, null);
    assert.equal(me.addressesCount, 0);
  });

  it('adds a first address: it becomes the default, phone normalised', async () => {
    const res = await req(newbie, 'POST', '/v1/me/addresses', home);
    assert.equal(res.statusCode, 201, res.body);
    const a = res.json();
    assert.equal(a.isDefault, true);
    assert.equal(a.phone, '+218917654321');
    assert.equal(a.landmark, 'قرب جامع الصحابة');
    const me = (await req(newbie, 'GET', '/v1/me')).json();
    assert.equal(me.defaultAddress.id, a.id);
  });

  it('now places the order; the order keeps a snapshot of the address', async () => {
    const res = await req(newbie, 'POST', '/v1/checkout', { deliveryMode: 'standard' });
    assert.equal(res.statusCode, 201, res.body);
    const order = (await req(newbie, 'GET', `/v1/orders/${res.json().id}`)).json();
    assert.equal(order.shippingAddress.landmark, 'قرب جامع الصحابة');
    assert.equal(order.shippingAddress.building, 'عمارة 4، الدور الثاني');

    // Editing the address later never rewrites the order.
    const list = (await req(newbie, 'GET', '/v1/me/addresses')).json().items;
    await req(newbie, 'PATCH', `/v1/me/addresses/${list[0].id}`, { street: 'شارع آخر' });
    const again = (await req(newbie, 'GET', `/v1/orders/${res.json().id}`)).json();
    assert.equal(again.shippingAddress.street, 'شارع قرقارش');
  });
});

describe('managing addresses', () => {
  let work: string;

  it('validates the city against the cities Stylo serves, and required fields', async () => {
    const cities = (await app.inject('/v1/cities')).json().items;
    assert.ok(cities.includes('طرابلس') && cities.includes('بنغازي'));
    let res = await req(newbie, 'POST', '/v1/me/addresses', { ...home, city: 'باريس' });
    assert.equal(res.statusCode, 400);
    res = await req(newbie, 'POST', '/v1/me/addresses', { ...home, street: '' });
    assert.equal(res.statusCode, 400);
    res = await req(newbie, 'POST', '/v1/me/addresses', { ...home, phone: '0812345678' });
    assert.equal(res.json().error.code, 'invalid_phone');
  });

  it('a second address is not the default unless asked; switching the default moves delivery pricing', async () => {
    const res = await req(newbie, 'POST', '/v1/me/addresses', {
      ...home,
      label: 'الشغل',
      city: 'بنغازي',
      district: 'الفويهات',
    });
    work = res.json().id;
    assert.equal(res.json().isDefault, false);

    const product = (await req(newbie, 'GET', `/v1/products/${DRESS}`)).json();
    const variant = product.variants.find((v: { stock: number }) => v.stock > 0);
    await req(newbie, 'POST', '/v1/cart/items', { variantId: variant.id });
    const sameCity = (await req(newbie, 'GET', '/v1/cart')).json();

    const list = (await req(newbie, 'POST', `/v1/me/addresses/${work}/default`)).json().items;
    assert.equal(list[0].id, work);
    assert.equal(list.filter((a: { isDefault: boolean }) => a.isDefault).length, 1);
    const otherCity = (await req(newbie, 'GET', '/v1/cart')).json();
    // طرابلس store → بنغازي customer takes longer than same-city delivery.
    assert.ok(
      Date.parse(otherCity.delivery.standard.arrivesAt) > Date.parse(sameCity.delivery.standard.arrivesAt),
      'intercity delivery is quoted after switching the default address',
    );
  });

  it('checkout can use a chosen address; someone else’s address is refused', async () => {
    const mine = (await req(newbie, 'GET', '/v1/me/addresses')).json().items;
    const home2 = mine.find((a: { label: string }) => a.label === 'البيت');
    const res = await req(newbie, 'POST', '/v1/checkout', { deliveryMode: 'standard', addressId: home2.id });
    assert.equal(res.statusCode, 201, res.body);
    const order = (await req(newbie, 'GET', `/v1/orders/${res.json().id}`)).json();
    assert.equal(order.shippingAddress.city, 'طرابلس');

    const saras = (await req(SARA, 'GET', '/v1/me/addresses')).json().items;
    const product = (await req(newbie, 'GET', `/v1/products/${DRESS}`)).json();
    await req(newbie, 'POST', '/v1/cart/items', { variantId: product.variants.find((v: { stock: number }) => v.stock > 0).id });
    const stolen = await req(newbie, 'POST', '/v1/checkout', { deliveryMode: 'standard', addressId: saras[0].id });
    assert.equal(stolen.statusCode, 404);
  });

  it("only the owner can read, edit or delete an address", async () => {
    assert.equal((await req(MARYAM, 'PATCH', `/v1/me/addresses/${work}`, { street: 'x y' })).statusCode, 404);
    assert.equal((await req(MARYAM, 'DELETE', `/v1/me/addresses/${work}`)).statusCode, 404);
    assert.equal((await req(MARYAM, 'POST', `/v1/me/addresses/${work}/default`)).statusCode, 404);
    const maryams = (await req(MARYAM, 'GET', '/v1/me/addresses')).json().items;
    assert.ok(maryams.every((a: { id: string }) => a.id !== work));
    assert.equal((await app.inject({ method: 'GET', url: '/v1/me/addresses' })).statusCode, 401);
  });

  it('PATCH changes only what was sent; isDefault cannot be switched off directly', async () => {
    const res = await req(newbie, 'PATCH', `/v1/me/addresses/${work}`, { landmark: 'مقابل مصرف الجمهورية' });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().landmark, 'مقابل مصرف الجمهورية');
    assert.equal(res.json().city, 'بنغازي');
    assert.equal(res.json().isDefault, true);
    assert.equal((await req(newbie, 'PATCH', `/v1/me/addresses/${work}`, { isDefault: false })).statusCode, 400);
  });

  it('deleting the default promotes another address; the last one can go too', async () => {
    let list = (await req(newbie, 'DELETE', `/v1/me/addresses/${work}`)).json().items;
    assert.equal(list.length, 1);
    assert.equal(list[0].isDefault, true);
    list = (await req(newbie, 'DELETE', `/v1/me/addresses/${list[0].id}`)).json().items;
    assert.equal(list.length, 0);
    assert.equal((await req(newbie, 'GET', '/v1/me')).json().defaultAddress, null);
  });

  it('keeps at most 10 addresses', async () => {
    for (let i = 0; i < 10; i++) {
      assert.equal((await req(newbie, 'POST', '/v1/me/addresses', { ...home, label: `عنوان ${i}` })).statusCode, 201);
    }
    const res = await req(newbie, 'POST', '/v1/me/addresses', home);
    assert.equal(res.json().error.code, 'too_many_addresses');
  });
});

describe('«تعديل الاسم»', () => {
  it('updates the name (trimmed) and rejects too short', async () => {
    const res = await req(newbie, 'PATCH', '/v1/me', { fullName: '  آمنة   سالم المصراتي ' });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().fullName, 'آمنة سالم المصراتي');
    assert.equal((await req(newbie, 'PATCH', '/v1/me', { fullName: 'ا' })).statusCode, 400);
    assert.equal((await app.inject({ method: 'PATCH', url: '/v1/me', payload: { fullName: 'سارة' } })).statusCode, 401);
  });
});
