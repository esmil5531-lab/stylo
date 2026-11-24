/**
 * Back-office (لوحة الإدارة) integration tests: permissions, store scoping, stores/staff/drivers,
 * and walking an order through the six statuses with a driver.
 * Runs against TEST_DATABASE_URL (rebuilt here), so test files run one at a time (see package.json).
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

const ADMIN = '00000000-0000-0000-0000-000000000001'; // super_admin
const OPS = '00000000-0000-0000-0000-000000000006'; // operations_manager
const SUPPORT = '00000000-0000-0000-0000-000000000007'; // customer_support (read-only)
const LAURA_MGR = '00000000-0000-0000-0000-000000000008'; // store_manager @ أزياء لورا
const CUSTOMER = '00000000-0000-0000-0000-000000000004';
const LAURA_STORE = '10000000-0000-0000-0000-000000000001';
const PENDING_LAURA_ORDER = '50000000-0000-0000-0000-000000000001';
const CHIC_ORDER = '50000000-0000-0000-0000-000000000002';
const FREE_DRIVER = '00000000-0000-0000-0000-000000000013';

let pool: Pool;
let app: FastifyInstance;

function req(user: string, method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown) {
  return app.inject({ method, url: `/v1/admin${url}`, payload: body as object, headers: { 'x-user-id': user } });
}

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
  app = await buildApp({ pool, config: loadConfig({ NODE_ENV: 'test', AUTH_DEV_HEADER: 'true', DATABASE_URL: TEST_DB }), logger: false });
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('access control', () => {
  it('customers are refused; staff get their role and permissions', async () => {
    assert.equal((await req(CUSTOMER, 'GET', '/me')).statusCode, 403);
    const me = (await req(ADMIN, 'GET', '/me')).json();
    assert.equal(me.role.key, 'super_admin');
    assert.ok(me.permissions.includes('staff.write'));
  });

  it('read-only support cannot change orders', async () => {
    const res = await req(SUPPORT, 'POST', `/orders/${PENDING_LAURA_ORDER}/status`, { to: 'confirmed' });
    assert.equal(res.statusCode, 403);
  });

  it('store managers only see their own store', async () => {
    const list = (await req(LAURA_MGR, 'GET', '/orders')).json();
    assert.ok(list.items.length > 0);
    assert.ok(list.items.every((o: { store: { id: string } }) => o.store.id === LAURA_STORE));
    assert.equal((await req(LAURA_MGR, 'GET', `/orders/${CHIC_ORDER}`)).statusCode, 404);
    assert.equal((await req(LAURA_MGR, 'GET', '/staff')).statusCode, 403);
  });
});

describe('stores, staff and drivers', () => {
  it('adds a store with its owner (fee in dirhams)', async () => {
    const res = await req(ADMIN, 'POST', '/stores', {
      nameAr: 'دار الأناقة',
      nameEn: 'Dar Elegance',
      city: 'مصراتة',
      deliveryFee: 12500,
      owner: { fullName: 'فاطمة الشريف', phone: '0921112233' },
    });
    assert.equal(res.statusCode, 201, res.body);
    const store = res.json();
    assert.equal(store.slug, 'dar-elegance');
    assert.equal(store.deliveryFee, 12500);
    assert.equal(store.status, 'pending_review');
    assert.equal(store.owner.phone, '+218921112233');

    await req(OPS, 'PATCH', `/stores/${store.id}`, { prepHours: 6, isFeatured: true });
    const patched = (await req(OPS, 'PATCH', `/stores/${store.id}`, { status: 'active', deliveryFee: 10000 })).json();
    assert.equal(patched.status, 'active');
    assert.equal(patched.deliveryFee, 10000);
    // Regression: a partial update must not reset fields it did not send.
    assert.equal(patched.prepHours, 6);
    assert.equal(patched.isFeatured, true);
  });

  it('rejects invalid Libyan phone numbers', async () => {
    const res = await req(ADMIN, 'POST', '/drivers', { fullName: 'سائق', phone: '0812345678', city: 'طرابلس' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'invalid_phone');
  });

  it('adds staff; store roles need a store; no privilege escalation', async () => {
    const noStore = await req(ADMIN, 'POST', '/staff', { fullName: 'نور', phone: '0913334444', roleKey: 'store_manager' });
    assert.equal(noStore.statusCode, 400);

    const ok = await req(ADMIN, 'POST', '/staff', {
      fullName: 'نور الهادي',
      phone: '0913334444',
      roleKey: 'store_manager',
      storeId: LAURA_STORE,
    });
    assert.equal(ok.statusCode, 201, ok.body);
    assert.equal(ok.json().store.id, LAURA_STORE);

    // Operations has no staff.* permissions at all.
    assert.equal(
      (await req(OPS, 'POST', '/staff', { fullName: 'x y', phone: '0915556666', roleKey: 'super_admin' })).statusCode,
      403,
    );
    // Duplicate phone.
    const dup = await req(ADMIN, 'POST', '/staff', { fullName: 'نور', phone: '+218913334444', roleKey: 'dispatcher' });
    assert.equal(dup.statusCode, 409);
  });

  it('adds a driver (offline) and makes them available', async () => {
    const res = await req(OPS, 'POST', '/drivers', {
      fullName: 'خالد الفيتوري',
      phone: '0947778888',
      city: 'طرابلس',
      vehicle: 'car',
    });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().status, 'offline');
    const updated = (await req(OPS, 'PATCH', `/drivers/${res.json().id}`, { status: 'available' })).json();
    assert.equal(updated.status, 'available');
    assert.equal(updated.vehicle, 'car'); // regression: status change kept the vehicle
  });
});

describe('order status workflow (6 statuses)', () => {
  it('store manager confirms and prepares, but cannot ship', async () => {
    let r = await req(LAURA_MGR, 'POST', `/orders/${PENDING_LAURA_ORDER}/status`, { to: 'confirmed' });
    assert.equal(r.statusCode, 200, r.body);
    r = await req(LAURA_MGR, 'POST', `/orders/${PENDING_LAURA_ORDER}/status`, { to: 'processing' });
    assert.deepEqual(r.json().allowedNext, ['cancelled']);
    r = await req(LAURA_MGR, 'POST', `/orders/${PENDING_LAURA_ORDER}/status`, { to: 'shipped' });
    assert.equal(r.statusCode, 403);
  });

  it('ops must assign a driver before "تم الشحن"; driver becomes busy, then free on delivery', async () => {
    let r = await req(OPS, 'POST', `/orders/${PENDING_LAURA_ORDER}/status`, { to: 'shipped' });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error.code, 'driver_required');

    r = await req(OPS, 'POST', `/orders/${PENDING_LAURA_ORDER}/driver`, { driverId: FREE_DRIVER });
    assert.equal(r.json().driver.id, FREE_DRIVER);

    r = await req(OPS, 'POST', `/orders/${PENDING_LAURA_ORDER}/status`, { to: 'shipped', note: 'خرج مع المندوب' });
    assert.equal(r.json().status, 'shipped');
    let d = await pool.query('SELECT status FROM drivers WHERE user_id = $1', [FREE_DRIVER]);
    assert.equal(d.rows[0].status, 'busy');

    r = await req(OPS, 'POST', `/orders/${PENDING_LAURA_ORDER}/status`, { to: 'delivered' });
    const order = r.json();
    assert.equal(order.status, 'delivered');
    assert.equal(order.paymentStatus, 'paid');
    assert.deepEqual(
      order.history.map((h: { to: string }) => h.to),
      ['pending', 'confirmed', 'processing', 'shipped', 'delivered'],
    );
    assert.equal(order.history[1].by, 'ريم الترهوني');
    assert.equal(order.history[3].note, 'خرج مع المندوب');
    d = await pool.query('SELECT status FROM drivers WHERE user_id = $1', [FREE_DRIVER]);
    assert.equal(d.rows[0].status, 'available');
  });

  it('refuses invalid transitions', async () => {
    const r = await req(ADMIN, 'POST', `/orders/${PENDING_LAURA_ORDER}/status`, { to: 'pending' });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error.code, 'invalid_transition');
  });

  it('cancelling needs a reason and returns stock', async () => {
    const before = await pool.query(`SELECT stock_qty FROM product_variants WHERE sku = 'CHC-HEL-NUD-38'`);
    let r = await req(ADMIN, 'POST', `/orders/${CHIC_ORDER}/status`, { to: 'cancelled' });
    assert.equal(r.json().error.code, 'cancel_reason_required');
    r = await req(ADMIN, 'POST', `/orders/${CHIC_ORDER}/status`, { to: 'cancelled', cancelReason: 'نفاد المقاس' });
    assert.equal(r.json().status, 'cancelled');
    assert.equal(r.json().cancelReason, 'نفاد المقاس');
    const after = await pool.query(`SELECT stock_qty FROM product_variants WHERE sku = 'CHC-HEL-NUD-38'`);
    assert.equal(after.rows[0].stock_qty, before.rows[0].stock_qty + 1);
  });

  it('dashboard counts follow the changes', async () => {
    const dash = (await req(ADMIN, 'GET', '/dashboard')).json();
    const db = await pool.query(`SELECT status, count(*)::int AS n FROM orders GROUP BY 1`);
    for (const r of db.rows) assert.equal(dash.ordersByStatus[r.status], r.n, r.status);
    const scoped = (await req(LAURA_MGR, 'GET', '/dashboard')).json();
    assert.equal(scoped.scope.storeId, LAURA_STORE);
    assert.equal(scoped.stores, null);
  });
});
