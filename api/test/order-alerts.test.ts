/**
 * «تنبيهات الطلبات»: new and late pending orders for the back office (store staff: their store
 * only), orders without a driver for dispatch, and the optional auto-cancel of orders no store
 * confirmed in time (restocked, recorded as a system change with its reason).
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';
import { autoCancelLatePending, autoCancelNote } from '../src/modules/admin/alerts.admin.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = fileURLToPath(new URL('../../database/', import.meta.url));
const OPS = '00000000-0000-0000-0000-000000000006';
const LAURA_OWNER = '00000000-0000-0000-0000-000000000002';
const CUSTOMER = '00000000-0000-0000-0000-000000000004';

let pool: Pool;
let app: FastifyInstance;
let lauraStore = '';
let lateOrder = '';
let otherStoreOrder = '';

const alerts = (user: string) => app.inject({ url: '/v1/admin/alerts', headers: { 'x-user-id': user } });

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
  app = await buildApp({
    pool,
    config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, AUTH_DEV_HEADER: 'true', PENDING_ALERT_MINUTES: '15' }),
    logger: false,
  });
  lauraStore = (await pool.query(`SELECT store_id FROM staff_members WHERE user_id = $1`, [LAURA_OWNER])).rows[0].store_id;
  // All pending orders are fresh, except one of Laura's: waiting for 40 minutes.
  await pool.query(`UPDATE orders SET placed_at = now() - interval '2 minutes' WHERE status = 'pending'`);
  const laura = await pool.query(`SELECT id FROM orders WHERE status = 'pending' AND store_id = $1 LIMIT 1`, [lauraStore]);
  lateOrder = laura.rows[0].id;
  await pool.query(`UPDATE orders SET placed_at = now() - interval '40 minutes' WHERE id = $1`, [lateOrder]);
  const other = await pool.query(`SELECT id FROM orders WHERE status = 'pending' AND store_id <> $1 LIMIT 1`, [lauraStore]);
  otherStoreOrder = other.rows[0]?.id ?? '';
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('order alerts in the back office', () => {
  it('Stylo staff: every pending order, the late ones with their wait, and orders without a driver', async () => {
    const res = await alerts(OPS);
    assert.equal(res.statusCode, 200, res.body);
    const a = res.json();
    const pending = (await pool.query(`SELECT count(*)::int AS n, max(order_number) AS m FROM orders WHERE status = 'pending'`)).rows[0];
    assert.equal(a.pending.count, pending.n);
    assert.equal(a.pending.newestOrderNumber, Number(pending.m));
    assert.equal(a.late.count, 1);
    assert.equal(a.late.minutes, 15);
    assert.equal(a.late.items[0].id, lateOrder);
    assert.ok(a.late.items[0].waitingMinutes >= 39 && a.late.items[0].waitingMinutes <= 41);
    const noDriver = (
      await pool.query(`SELECT count(*)::int AS n FROM orders WHERE status IN ('confirmed','processing') AND driver_id IS NULL`)
    ).rows[0].n;
    assert.deepEqual(a.unassigned?.count, noDriver);
    assert.equal(a.autoCancelMinutes, 0);
  });

  it('store staff: only their store, and no dispatch figures', async () => {
    const a = (await alerts(LAURA_OWNER)).json();
    const mine = (
      await pool.query(`SELECT count(*)::int AS n FROM orders WHERE status = 'pending' AND store_id = $1`, [lauraStore])
    ).rows[0].n;
    assert.equal(a.pending.count, mine);
    assert.equal(a.late.count, 1);
    assert.equal(a.unassigned, null);
    if (otherStoreOrder) assert.ok(!a.late.items.some((o: { id: string }) => o.id === otherStoreOrder));
  });

  it('customers and signed-out callers cannot read alerts', async () => {
    assert.equal((await alerts(CUSTOMER)).statusCode, 403);
    assert.equal((await app.inject('/v1/admin/alerts')).statusCode, 401);
  });
});

describe('auto-cancel of orders no store confirmed (optional)', () => {
  it('off (0 minutes) cancels nothing', async () => {
    assert.deepEqual(await autoCancelLatePending(pool, new Date(), 0), []);
  });

  it('cancels only orders older than the delay, restocks them and records why', async () => {
    const stockBefore = (
      await pool.query(
        `SELECT v.id, v.stock_qty, oi.quantity FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id
          WHERE oi.order_id = $1`,
        [lateOrder],
      )
    ).rows;
    const pendingBefore = (await pool.query(`SELECT count(*)::int AS n FROM orders WHERE status = 'pending'`)).rows[0].n;

    const ids = await autoCancelLatePending(pool, new Date(), 30);
    assert.deepEqual(ids, [lateOrder]);

    const o = (await pool.query(`SELECT status, cancel_reason FROM orders WHERE id = $1`, [lateOrder])).rows[0];
    assert.equal(o.status, 'cancelled');
    assert.equal(o.cancel_reason, autoCancelNote(30));
    const h = (
      await pool.query(
        `SELECT changed_by, note FROM order_status_history WHERE order_id = $1 AND to_status = 'cancelled'`,
        [lateOrder],
      )
    ).rows[0];
    assert.equal(h.changed_by, null, 'a system change has no actor');
    assert.equal(h.note, autoCancelNote(30));
    for (const v of stockBefore) {
      const now = (await pool.query(`SELECT stock_qty FROM product_variants WHERE id = $1`, [v.id])).rows[0].stock_qty;
      assert.equal(now, v.stock_qty + v.quantity, 'items back on the shelf');
    }
    const pendingAfter = (await pool.query(`SELECT count(*)::int AS n FROM orders WHERE status = 'pending'`)).rows[0].n;
    assert.equal(pendingAfter, pendingBefore - 1, 'fresh pending orders are untouched');
    // Running again does nothing more.
    assert.deepEqual(await autoCancelLatePending(pool, new Date(), 30), []);
    assert.equal((await alerts(OPS)).json().late.count, 0);
  });
});
