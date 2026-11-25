/**
 * Phase B orders: the price the customer saw is the price she pays, she can cancel while the
 * store has not confirmed, and «تعذّر التسليم» (failed delivery) with a required reason.
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
const SARA = '00000000-0000-0000-0000-000000000004';
const MARYAM = '00000000-0000-0000-0000-000000000005';
const MOHAMED = '00000000-0000-0000-0000-000000000011';
const ALI = '00000000-0000-0000-0000-000000000012';
const SALEM = '00000000-0000-0000-0000-000000000013';
const SHIPPED_ORDER = '50000000-0000-0000-0000-000000000004'; // shipped, driver محمد
const PROCESSING_ORDER = '50000000-0000-0000-0000-000000000003';

let pool: Pool;
let app: FastifyInstance;

function req(user: string, method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown) {
  return app.inject({ method, url, payload: body as object, headers: { 'x-user-id': user } });
}
const stockOf = async (orderId: string) =>
  (
    await pool.query(
      `SELECT v.id, v.stock_qty FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id WHERE oi.order_id = $1 ORDER BY v.id`,
      [orderId],
    )
  ).rows.map((r) => r.stock_qty as number);

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

describe('checkout: the total she saw', () => {
  let orderId = '';

  it('refuses when the total changed since the cart was shown, accepts the right one', async () => {
    await req(SARA, 'DELETE', '/v1/cart');
    const v = (await pool.query(`SELECT id FROM product_variants WHERE sku = 'LAU-WRP-BRG-M'`)).rows[0].id;
    const cart = (await req(SARA, 'POST', '/v1/cart/items', { variantId: v, quantity: 1 })).json();
    const total = cart.totals.standard as number;
    let res = await req(SARA, 'POST', '/v1/checkout', { deliveryMode: 'standard', expectedTotal: total - 1000 });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, 'price_changed');
    assert.equal(res.json().error.details.total, total);
    res = await req(SARA, 'POST', '/v1/checkout', { deliveryMode: 'standard', expectedTotal: total });
    assert.equal(res.statusCode, 201, res.body);
    orderId = res.json().id;
  });

  it('the customer cancels while «قيد الانتظار»: stock comes back, history says it was her', async () => {
    const before = await stockOf(orderId);
    assert.equal((await req(MARYAM, 'POST', `/v1/orders/${orderId}/cancel`)).statusCode, 404);
    const res = await req(SARA, 'POST', `/v1/orders/${orderId}/cancel`, { reason: 'طلبت بالخطأ' });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().status, 'cancelled');
    assert.deepEqual(await stockOf(orderId), before.map((s) => s + 1));
    const h = (await pool.query(`SELECT changed_by, note FROM order_status_history WHERE order_id = $1 AND to_status = 'cancelled'`, [orderId])).rows[0];
    assert.equal(h.changed_by, SARA);
    assert.match(h.note, /ألغته الزبونة: طلبت بالخطأ/);
    assert.equal((await req(SARA, 'POST', `/v1/orders/${orderId}/cancel`)).json().error.code, 'cannot_cancel');
  });

  it('after the store confirmed, she can no longer cancel', async () => {
    const confirmed = (await pool.query(`SELECT id, customer_id FROM orders WHERE status = 'confirmed' LIMIT 1`)).rows[0];
    const res = await req(confirmed.customer_id, 'POST', `/v1/orders/${confirmed.id}/cancel`);
    assert.equal(res.json().error.code, 'cannot_cancel');
  });
});

describe('«تعذّر التسليم» (failed delivery)', () => {
  it('the driver must choose a reason; the order is cancelled, stock is back, no cash collected', async () => {
    let res = await req(MOHAMED, 'POST', `/v1/driver/orders/${SHIPPED_ORDER}/failed`, {});
    assert.equal(res.statusCode, 400);
    res = await req(MOHAMED, 'POST', `/v1/driver/orders/${SHIPPED_ORDER}/failed`, { reason: 'bad' });
    assert.equal(res.statusCode, 400);
    assert.equal((await req(ALI, 'POST', `/v1/driver/orders/${SHIPPED_ORDER}/failed`, { reason: 'no_answer' })).statusCode, 404);

    const before = await stockOf(SHIPPED_ORDER);
    const custody = (await req(MOHAMED, 'GET', '/v1/driver/me')).json().custody.amount;
    res = await req(MOHAMED, 'POST', `/v1/driver/orders/${SHIPPED_ORDER}/failed`, {
      reason: 'no_answer',
      note: 'اتصلت 3 مرات',
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().status, 'cancelled');
    assert.equal(res.json().failure, 'تعذّر التسليم: الزبون لا يرد — اتصلت 3 مرات');
    const after = await stockOf(SHIPPED_ORDER);
    const qty = (await pool.query(`SELECT quantity FROM order_items WHERE order_id = $1 ORDER BY variant_id`, [SHIPPED_ORDER])).rows;
    assert.deepEqual(after, before.map((s, i) => s + qty[i].quantity));
    const o = (await pool.query(`SELECT delivery_failure, cash_collected_at FROM orders WHERE id = $1`, [SHIPPED_ORDER])).rows[0];
    assert.equal(o.delivery_failure, 'no_answer');
    assert.equal(o.cash_collected_at, null);
    // Not in custody; on the «أعِد إلى المتجر» list; the driver is free again.
    const me = (await req(MOHAMED, 'GET', '/v1/driver/me')).json();
    assert.equal(me.custody.amount, custody);
    assert.equal(me.driver.status, 'available');
    const list = (await req(MOHAMED, 'GET', '/v1/driver/orders')).json();
    assert.ok(list.returnToStore.some((x: { id: string }) => x.id === SHIPPED_ORDER));
    assert.ok(!list.active.some((x: { id: string }) => x.id === SHIPPED_ORDER));
    // The reason is in the history the back office and the store see.
    const detail = (await req(OPS, 'GET', `/v1/admin/orders/${SHIPPED_ORDER}`)).json();
    assert.ok(JSON.stringify(detail).includes('تعذّر التسليم: الزبون لا يرد'));
  });

  it('Stylo staff can record a failed delivery too (reason required); stores cannot cancel a shipped order', async () => {
    await req(OPS, 'POST', `/v1/admin/orders/${PROCESSING_ORDER}/driver`, { driverId: SALEM });
    let res = await req(OPS, 'POST', `/v1/admin/orders/${PROCESSING_ORDER}/status`, { to: 'shipped' });
    assert.equal(res.statusCode, 200, res.body);

    const owner = (
      await pool.query(
        `SELECT sm.user_id FROM staff_members sm JOIN orders o ON o.store_id = sm.store_id WHERE o.id = $1 LIMIT 1`,
        [PROCESSING_ORDER],
      )
    ).rows[0];
    if (owner) {
      res = await req(owner.user_id, 'POST', `/v1/admin/orders/${PROCESSING_ORDER}/status`, {
        to: 'cancelled',
        cancelReason: 'x',
        failureReason: 'refused',
      });
      assert.equal(res.statusCode, 403, res.body);
    }

    res = await req(OPS, 'POST', `/v1/admin/orders/${PROCESSING_ORDER}/status`, { to: 'cancelled', cancelReason: 'رفضت' });
    assert.equal(res.json().error.code, 'failure_reason_required');
    res = await req(OPS, 'POST', `/v1/admin/orders/${PROCESSING_ORDER}/status`, {
      to: 'cancelled',
      failureReason: 'refused',
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.match(res.json().cancelReason, /تعذّر التسليم: رفض الاستلام/);
  });

  it('the database refuses shipped → cancelled without a reason', async () => {
    const o = (await pool.query(`SELECT id FROM orders WHERE status = 'shipped' LIMIT 1`)).rows[0];
    if (!o) return;
    await assert.rejects(pool.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [o.id]), /failed delivery/);
  });
});
