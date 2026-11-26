/**
 * Step 5: returns after delivery (restock + deducted from the store's next payout), the customer
 * refusal record + block, and store bank accounts (IBAN check, verification, visibility).
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';
import { isValidLibyanIban, normaliseIban } from '../src/lib/iban.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = fileURLToPath(new URL('../../database/', import.meta.url));
const ADMIN = '00000000-0000-0000-0000-000000000001';
const LAURA_OWNER = '00000000-0000-0000-0000-000000000002';
const SARA = '00000000-0000-0000-0000-000000000004';
const OPS = '00000000-0000-0000-0000-000000000006';
const SUPPORT = '00000000-0000-0000-0000-000000000007';
const IBAN = 'LY83002048000020100120361';

let pool: Pool;
let app: FastifyInstance;

function req(user: string | null, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown) {
  return app.inject({ method, url, payload: body as object, headers: user ? { 'x-user-id': user } : {} });
}
const keys = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => keys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (out.add(k), keys(x, out));
  return out;
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
});

after(async () => {
  await app?.close();
  await pool?.end();
});

/** The most recently delivered order (within the returns window) and its store. */
async function recentDelivered() {
  const { rows } = await pool.query(
    `SELECT o.id, o.store_id, o.customer_id, max(h.changed_at) AS delivered_at
       FROM orders o JOIN order_status_history h ON h.order_id = o.id AND h.to_status = 'delivered'
      WHERE o.status = 'delivered' GROUP BY o.id ORDER BY delivered_at DESC LIMIT 1`,
  );
  return rows[0] as { id: string; store_id: string; customer_id: string };
}

describe('returns («المرتجعات»)', () => {
  it('records returned pieces: restocked, refund = their price, never more than ordered', async () => {
    const order = await recentDelivered();
    const detail = (await req(OPS, 'GET', `/v1/admin/orders/${order.id}`)).json();
    assert.equal(detail.canReturn, true);
    const line = detail.items[0];
    const variant = (await pool.query(`SELECT variant_id FROM order_items WHERE id = $1`, [line.id])).rows[0].variant_id;
    const stock = async () => (await pool.query(`SELECT stock_qty FROM product_variants WHERE id = $1`, [variant])).rows[0].stock_qty;
    const before = await stock();

    // Stores do not record returns; support and operations do.
    assert.equal((await req(LAURA_OWNER, 'POST', `/v1/admin/orders/${order.id}/returns`, { items: [{ orderItemId: line.id, quantity: 1 }], reason: 'wrong_size' })).statusCode, 403);
    const res = await req(SUPPORT, 'POST', `/v1/admin/orders/${order.id}/returns`, {
      items: [{ orderItemId: line.id, quantity: 1 }],
      reason: 'wrong_size',
      note: 'المقاس صغير',
    });
    assert.equal(res.statusCode, 201, res.body);
    const ret = res.json();
    assert.ok(ret.number >= 9001);
    assert.equal(ret.amount, line.unitPrice);
    assert.equal(ret.restocked, true);
    assert.equal(ret.reasonLabel, 'المقاس غير مناسب');
    assert.equal(await stock(), before + 1);

    const after = (await req(OPS, 'GET', `/v1/admin/orders/${order.id}`)).json();
    assert.equal(after.items[0].returned, 1);
    assert.equal(after.returns.length, 1);
    // More than what is left → refused.
    const tooMany = await req(OPS, 'POST', `/v1/admin/orders/${order.id}/returns`, {
      items: [{ orderItemId: line.id, quantity: line.quantity }],
      reason: 'changed_mind',
    });
    assert.equal(tooMany.statusCode, 409);
    assert.equal(tooMany.json().error.code, 'too_many_returned');
    // The customer sees it on her order (no internal reason or note).
    const hers = (await req(order.customer_id, 'GET', `/v1/orders/${order.id}`)).json();
    assert.equal(hers.returns.length, 1);
    assert.equal(hers.returns[0].refund, line.unitPrice);
    assert.ok(!('note' in hers.returns[0]) && !('reason' in hers.returns[0]));
  });

  it('defective pieces are not put back on sale; only delivered orders, only within the window', async () => {
    // Another recent delivered order with a line left.
    const { rows } = await pool.query(
      `SELECT o.id, oi.id AS item_id, oi.variant_id FROM orders o JOIN order_items oi ON oi.order_id = o.id
         JOIN order_status_history h ON h.order_id = o.id AND h.to_status = 'delivered'
        WHERE o.status = 'delivered' AND NOT EXISTS (SELECT 1 FROM order_returns r WHERE r.order_id = o.id)
        ORDER BY h.changed_at DESC LIMIT 1`,
    );
    const o = rows[0];
    const before = (await pool.query(`SELECT stock_qty FROM product_variants WHERE id = $1`, [o.variant_id])).rows[0].stock_qty;
    const res = await req(OPS, 'POST', `/v1/admin/orders/${o.id}/returns`, { items: [{ orderItemId: o.item_id, quantity: 1 }], reason: 'defective' });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().restocked, false);
    assert.equal((await pool.query(`SELECT stock_qty FROM product_variants WHERE id = $1`, [o.variant_id])).rows[0].stock_qty, before);

    const pending = (await pool.query(`SELECT o.id, oi.id AS item FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.status = 'pending' LIMIT 1`)).rows[0];
    const notDelivered = await req(OPS, 'POST', `/v1/admin/orders/${pending.id}/returns`, { items: [{ orderItemId: pending.item, quantity: 1 }], reason: 'other' });
    assert.equal(notDelivered.json().error.code, 'not_delivered');

    const old = (
      await pool.query(
        `SELECT o.id, oi.id AS item FROM orders o JOIN order_items oi ON oi.order_id = o.id
           JOIN order_status_history h ON h.order_id = o.id AND h.to_status = 'delivered'
          WHERE o.status = 'delivered' AND h.changed_at < now() - interval '5 days' LIMIT 1`,
      )
    ).rows[0];
    const late = await req(OPS, 'POST', `/v1/admin/orders/${old.id}/returns`, { items: [{ orderItemId: old.item, quantity: 1 }], reason: 'other' });
    assert.equal(late.statusCode, 409);
    assert.equal(late.json().error.code, 'return_window_passed');
  });

  it("the store's next payout deducts the returns and gives back Stylo's commission on them", async () => {
    const order = await recentDelivered();
    const r = (await pool.query(`SELECT amount, commission_amount FROM order_returns WHERE order_id = $1`, [order.id])).rows[0];
    const from = '2026-01-01';
    const to = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const preview = (await req(ADMIN, 'GET', `/v1/admin/payouts/preview?storeId=${order.store_id}&from=${from}&to=${to}`)).json();
    assert.ok(preview.returnsCount >= 1);
    assert.equal(preview.payout, preview.sales - preview.commission - preview.returnsAmount + preview.returnsCommission);
    assert.ok(preview.returns.some((x: { amount: number }) => x.amount === Number(r.amount)));

    const created = await req(ADMIN, 'POST', '/v1/admin/payouts', { storeId: order.store_id, from, to });
    assert.equal(created.statusCode, 201, created.body);
    const payout = created.json();
    assert.equal(payout.returnsAmount, preview.returnsAmount);
    assert.equal(payout.payoutAmount, preview.payout);
    assert.equal(payout.returns.length, preview.returnsCount);
    // Deducted once: the next preview has none; cancelling the payout releases them.
    const again = (await req(ADMIN, 'GET', `/v1/admin/payouts/preview?storeId=${order.store_id}&from=${from}&to=${to}`)).json();
    assert.equal(again.returnsCount, 0);
    assert.equal((await req(ADMIN, 'DELETE', `/v1/admin/payouts/${payout.id}`)).statusCode, 200);
    const released = (await req(ADMIN, 'GET', `/v1/admin/payouts/preview?storeId=${order.store_id}&from=${from}&to=${to}`)).json();
    assert.equal(released.returnsCount, preview.returnsCount);
  });

  it('reports show the returns; commission on them stays the general manager’s', async () => {
    const report = (await req(ADMIN, 'GET', '/v1/admin/reports?period=7d')).json();
    assert.ok(report.summary.returnsCount >= 2);
    assert.equal(report.summary.netSales, report.summary.sales - report.summary.returnedSales);
    const ops = (await req(OPS, 'GET', '/v1/admin/reports?period=7d')).json();
    assert.ok(!keys(ops).has('returnedCommission') && !keys(ops).has('returnsCommission'));
  });
});

describe('customer refusals and block', () => {
  it('the order shows the customer record; staff block her and she can no longer check out', async () => {
    // Two refused deliveries on Sara's record.
    await pool.query(
      `UPDATE orders SET delivery_failure = 'refused'
        WHERE id IN (SELECT id FROM orders WHERE customer_id = $1 AND status = 'cancelled' LIMIT 2)`,
      [SARA],
    );
    const order = (await pool.query(`SELECT id FROM orders WHERE customer_id = $1 ORDER BY placed_at DESC LIMIT 1`, [SARA])).rows[0];
    const detail = (await req(OPS, 'GET', `/v1/admin/orders/${order.id}`)).json();
    assert.ok(detail.customerRecord.refusals >= 2);
    assert.equal(detail.customerRecord.warn, true);
    assert.equal(detail.customerRecord.blocked, null);
    const list = (await req(OPS, 'GET', '/v1/admin/orders?limit=100')).json().items;
    assert.ok(list.find((o: { id: string }) => o.id === order.id).customer.refusals >= 2);

    // A reason is required; stores cannot block; staff cannot be blocked.
    assert.equal((await req(OPS, 'POST', `/v1/admin/customers/${SARA}/block`, { blocked: true })).statusCode, 400);
    assert.equal((await req(LAURA_OWNER, 'POST', `/v1/admin/customers/${SARA}/block`, { blocked: true, reason: 'x' })).statusCode, 403);
    assert.equal((await req(OPS, 'POST', `/v1/admin/customers/${ADMIN}/block`, { blocked: true, reason: 'x' })).statusCode, 404);
    const blocked = await req(OPS, 'POST', `/v1/admin/customers/${SARA}/block`, { blocked: true, reason: 'رفضت الاستلام مرتين' });
    assert.equal(blocked.statusCode, 200, blocked.body);
    assert.equal(blocked.json().blocked.reason, 'رفضت الاستلام مرتين');

    const variant = (await pool.query(`SELECT id FROM product_variants WHERE sku = 'LAU-SUN-BLK'`)).rows[0].id;
    await req(SARA, 'POST', '/v1/cart/items', { variantId: variant, quantity: 1, replaceCart: true });
    const refused = await req(SARA, 'POST', '/v1/checkout', { deliveryMode: 'standard' });
    assert.equal(refused.statusCode, 403);
    assert.equal(refused.json().error.code, 'customer_blocked');
    assert.equal((await req(SARA, 'GET', '/v1/products?limit=1')).statusCode, 200); // browsing stays open

    assert.equal((await req(OPS, 'POST', `/v1/admin/customers/${SARA}/block`, { blocked: false })).json().blocked, null);
    assert.equal((await req(SARA, 'POST', '/v1/checkout', { deliveryMode: 'standard' })).statusCode, 201);
  });
});

describe('store bank accounts', () => {
  it('checks the Libyan IBAN (format + mod 97), accepting spaces and Arabic digits', () => {
    assert.equal(isValidLibyanIban(IBAN), true);
    assert.equal(isValidLibyanIban(IBAN.replace('361', '362')), false);
    assert.equal(normaliseIban('ly83 0020 4800 0020 1001 2036 ١'), IBAN);
  });

  it('the store fills it in, the general manager verifies it, any change needs a new verification', async () => {
    const bad = await req(LAURA_OWNER, 'PUT', '/v1/admin/my-store/bank', { bankName: 'مصرف الجمهورية', accountName: 'أزياء لورا', iban: 'LY83002048000020100120362' });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'invalid_iban');
    const saved = (await req(LAURA_OWNER, 'PUT', '/v1/admin/my-store/bank', { bankName: 'مصرف الجمهورية', accountName: 'أزياء لورا', iban: 'LY83 0020 4800 0020 1001 2036 1' })).json();
    assert.equal(saved.iban, IBAN);
    assert.equal(saved.complete, true);
    assert.equal(saved.verified, false);

    const store = (await pool.query(`SELECT store_id FROM staff_members WHERE user_id = $1`, [LAURA_OWNER])).rows[0].store_id;
    // Operations staff see stores but not their bank accounts.
    assert.equal((await req(OPS, 'GET', `/v1/admin/stores/${store}/bank`)).statusCode, 403);
    assert.equal((await req(OPS, 'POST', `/v1/admin/stores/${store}/bank/verify`)).statusCode, 403);
    const verified = (await req(ADMIN, 'POST', `/v1/admin/stores/${store}/bank/verify`)).json();
    assert.equal(verified.verified, true);
    assert.ok(verified.verifiedBy);

    // The payout shows where to transfer, to the store and the general manager only.
    const from = '2026-01-01';
    const to = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const payout = (await req(ADMIN, 'POST', '/v1/admin/payouts', { storeId: store, from, to })).json();
    assert.equal((await req(ADMIN, 'GET', `/v1/admin/payouts/${payout.id}`)).json().bank.iban, IBAN);
    assert.equal((await req(LAURA_OWNER, 'GET', `/v1/admin/payouts/${payout.id}`)).json().bank.verified, true);

    // Changing the account clears the verification.
    const changed = (await req(LAURA_OWNER, 'PUT', '/v1/admin/my-store/bank', { bankName: 'مصرف الوحدة', accountName: 'أزياء لورا', iban: IBAN })).json();
    assert.equal(changed.verified, false);
  });
});
