/**
 * Driver cash custody (عُهدة المناديب), driver mode (/v1/driver), commission visible to the general
 * manager only, and WhatsApp messaging (OTP + order status updates).
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';
import { buildWhatsAppOtpPayload } from '../src/lib/messaging.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = new URL('../../database/', import.meta.url).pathname;

const ADMIN = '00000000-0000-0000-0000-000000000001'; // مدير عام (finance.view)
const OPS = '00000000-0000-0000-0000-000000000006'; // أحمد الزوي — مدير عمليات
const SUPPORT = '00000000-0000-0000-0000-000000000007';
const LAURA_OWNER = '00000000-0000-0000-0000-000000000002';
const CUSTOMER = '00000000-0000-0000-0000-000000000004';
const MOHAMED = '00000000-0000-0000-0000-000000000011'; // driver with 4 COD orders in custody
const ALI = '00000000-0000-0000-0000-000000000012';
const SALEM = '00000000-0000-0000-0000-000000000013';
const SHIPPED_ORDER = '50000000-0000-0000-0000-000000000004'; // shipped, driver محمد
const PROCESSING_ORDER = '50000000-0000-0000-0000-000000000003'; // processing, no driver

let pool: Pool;
let app: FastifyInstance;

function req(user: string, method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown) {
  return app.inject({ method, url, payload: body as object, headers: { 'x-user-id': user } });
}

/** Every key anywhere in a JSON value. */
function keys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keys(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keys(x, out);
    }
  }
  return out;
}
const hasCommission = (v: unknown) =>
  [...keys(v)].some((k) => /commission|styloRevenue/i.test(k));

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

describe('driver cash custody', () => {
  it('lists each driver with the cash they hold', async () => {
    const res = await req(OPS, 'GET', '/v1/admin/custody');
    assert.equal(res.statusCode, 200, res.body);
    const mohamed = res.json().items.find((i: { driver: { id: string } }) => i.driver.id === MOHAMED);
    const db = await pool.query(
      `SELECT count(*)::int AS n, SUM(total)::bigint AS amount FROM orders o
        WHERE driver_id = $1 AND cash_collected_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM driver_settlement_orders x WHERE x.order_id = o.id)`,
      [MOHAMED],
    );
    assert.equal(mohamed.ordersCount, 4);
    assert.equal(mohamed.storesCount, 4);
    assert.equal(mohamed.amount, db.rows[0].amount);
  });

  it('breaks the cash down per store; the general manager sees the commission', async () => {
    const res = await req(ADMIN, 'GET', `/v1/admin/custody/${MOHAMED}`);
    assert.equal(res.statusCode, 200, res.body);
    const c = res.json();
    assert.equal(c.byStore.length, 4);
    assert.equal(c.totals.amount, c.totals.storeNet + c.totals.deliveryFees + c.totals.commission);
    for (const o of c.orders) assert.equal(o.storeNet, o.subtotal - o.commission);
    assert.ok(c.totals.commission > 0);
  });

  it('hides the commission from operations staff', async () => {
    const c = (await req(OPS, 'GET', `/v1/admin/custody/${MOHAMED}`)).json();
    assert.equal(c.byStore.length, 4);
    assert.ok(c.totals.storeNet > 0);
    assert.equal(hasCommission(c), false, 'no commission field may reach operations staff');
    // Nothing to subtract the commission from either: only the cash and each store's net.
    const k = keys(c);
    for (const leak of ['subtotal', 'deliveryFee', 'deliveryFees']) assert.equal(k.has(leak), false, leak);
    assert.deepEqual(Object.keys(c.byStore[0]).sort(), ['collected', 'ordersCount', 'store', 'storeNet']);
  });

  it('store owners and read-only support cannot open custody', async () => {
    assert.equal((await req(LAURA_OWNER, 'GET', '/v1/admin/custody')).statusCode, 403);
    assert.equal((await req(SUPPORT, 'GET', '/v1/admin/custody')).statusCode, 403);
  });

  it('closes the custody: records amount, time and the receiving employee, then resets to zero', async () => {
    const before = (await req(OPS, 'GET', `/v1/admin/custody/${MOHAMED}`)).json();
    const amount = before.totals.amount;

    let res = await req(OPS, 'POST', `/v1/admin/custody/${MOHAMED}/settle`, { amountReceived: amount - 5000 });
    assert.equal(res.json().error.code, 'note_required');

    res = await req(OPS, 'POST', `/v1/admin/custody/${MOHAMED}/settle`, {
      amountReceived: amount,
      expectedAmount: amount + 1,
    });
    assert.equal(res.json().error.code, 'custody_changed');

    res = await req(OPS, 'POST', `/v1/admin/custody/${MOHAMED}/settle`, {
      amountReceived: amount,
      expectedAmount: amount,
    });
    assert.equal(res.statusCode, 201, res.body);
    const s = res.json();
    assert.equal(s.amountExpected, amount);
    assert.equal(s.amountReceived, amount);
    assert.equal(s.difference, 0);
    assert.equal(s.ordersCount, 4);
    assert.equal(s.receivedBy.name, 'أحمد الزوي');
    assert.ok(Date.parse(s.settledAt) > Date.now() - 60_000);
    assert.equal(hasCommission(s), false);

    const after = (await req(OPS, 'GET', `/v1/admin/custody/${MOHAMED}`)).json();
    assert.equal(after.totals.amount, 0);
    assert.equal(after.orders.length, 0);

    res = await req(OPS, 'POST', `/v1/admin/custody/${MOHAMED}/settle`, { amountReceived: 0 });
    assert.equal(res.json().error.code, 'nothing_to_settle');

    const history = (await req(OPS, 'GET', `/v1/admin/custody/settlements?driverId=${MOHAMED}`)).json();
    assert.equal(history.items[0].id, s.id);
  });

  it('a shortfall is kept with its note', async () => {
    const c = (await req(ADMIN, 'GET', `/v1/admin/custody/${SALEM}`)).json();
    assert.ok(c.totals.amount > 0);
    const res = await req(ADMIN, 'POST', `/v1/admin/custody/${SALEM}/settle`, {
      amountReceived: c.totals.amount - 10_000,
      note: 'نقص 10 د.ل — يُخصم لاحقاً',
    });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().difference, -10_000);
  });
});

describe('commission is for the general manager only', () => {
  it('operations cannot open store payouts (sales next to dues reveal the commission)', async () => {
    assert.equal((await req(OPS, 'GET', '/v1/admin/payouts/balances')).statusCode, 403);
    const ops = (await req(OPS, 'GET', '/v1/admin/reports')).json();
    assert.equal('storePayout' in ops.summary, false);
    assert.equal('payout' in ops.byStore[0], false);
    const owner = (await req(LAURA_OWNER, 'GET', '/v1/admin/reports')).json();
    assert.ok(owner.summary.storePayout > 0, 'a store still sees its own dues');
  });

  it('reports: operations and store owners get no commission figures', async () => {
    const admin = (await req(ADMIN, 'GET', '/v1/admin/reports')).json();
    assert.ok(admin.summary.commission > 0);
    for (const user of [OPS, LAURA_OWNER]) {
      const r = (await req(user, 'GET', '/v1/admin/reports')).json();
      assert.ok(r.summary.sales > 0);
      assert.equal(hasCommission(r), false);
    }
  });

  it('payouts and store settings: no commission for store owners', async () => {
    const balances = (await req(LAURA_OWNER, 'GET', '/v1/admin/payouts/balances')).json();
    assert.ok(balances.items.length > 0);
    assert.equal(hasCommission(balances), false);
    const myStore = (await req(LAURA_OWNER, 'GET', '/v1/admin/my-store')).json();
    assert.equal(hasCommission(myStore), false);
    const stores = (await req(OPS, 'GET', '/v1/admin/stores')).json();
    assert.equal(hasCommission(stores), false);
    const adminStores = (await req(ADMIN, 'GET', '/v1/admin/stores')).json();
    assert.ok(adminStores.items[0].commissionBps > 0);
  });
});

describe('driver mode (/v1/driver)', () => {
  it('only active drivers get in', async () => {
    assert.equal((await req(CUSTOMER, 'GET', '/v1/driver/me')).statusCode, 403);
    assert.equal((await req(OPS, 'GET', '/v1/driver/me')).statusCode, 403);
  });

  it('delivers a COD order: collects the cash into custody, never sees commission', async () => {
    const list = (await req(MOHAMED, 'GET', '/v1/driver/orders')).json();
    const order = list.active.find((o: { id: string }) => o.id === SHIPPED_ORDER);
    assert.ok(order, 'the shipped order is in the driver list');
    assert.equal(order.canDeliver, true);
    assert.equal(order.paymentMethod, 'cod');
    assert.equal(hasCommission(list), false);

    // Another driver cannot touch it.
    assert.equal((await req(ALI, 'POST', `/v1/driver/orders/${SHIPPED_ORDER}/delivered`)).statusCode, 404);

    const before = (await req(MOHAMED, 'GET', '/v1/driver/me')).json();
    const res = await req(MOHAMED, 'POST', `/v1/driver/orders/${SHIPPED_ORDER}/delivered`);
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().status, 'delivered');
    assert.ok(res.json().cashCollectedAt);

    const me = (await req(MOHAMED, 'GET', '/v1/driver/me')).json();
    assert.equal(me.custody.amount, before.custody.amount + order.amountToCollect);
    assert.equal(me.custody.ordersCount, before.custody.ordersCount + 1);
    assert.equal(me.driver.status, 'available');
    assert.equal(hasCommission(me), false);

    const history = await pool.query(
      `SELECT changed_by, note FROM order_status_history WHERE order_id = $1 AND to_status = 'delivered'`,
      [SHIPPED_ORDER],
    );
    assert.equal(history.rows[0].changed_by, MOHAMED);

    // Delivering twice is refused.
    const again = await req(MOHAMED, 'POST', `/v1/driver/orders/${SHIPPED_ORDER}/delivered`);
    assert.equal(again.json().error.code, 'invalid_transition');
  });

  it('picks up from the store (processing → shipped) and becomes busy', async () => {
    const assign = await req(OPS, 'POST', `/v1/admin/orders/${PROCESSING_ORDER}/driver`, { driverId: SALEM });
    assert.equal(assign.statusCode, 200, assign.body);
    const res = await req(SALEM, 'POST', `/v1/driver/orders/${PROCESSING_ORDER}/picked-up`);
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().status, 'shipped');
    const me = (await req(SALEM, 'GET', '/v1/driver/me')).json();
    assert.equal(me.driver.status, 'busy');
    const off = await req(SALEM, 'PATCH', '/v1/driver/me/status', { status: 'offline' });
    assert.equal(off.json().error.code, 'has_active_delivery');
  });

  it('admin delivery of a COD order also lands in the driver custody', async () => {
    const res = await req(OPS, 'POST', `/v1/admin/orders/${PROCESSING_ORDER}/status`, { to: 'delivered' });
    assert.equal(res.statusCode, 200, res.body);
    const c = (await req(OPS, 'GET', `/v1/admin/custody/${SALEM}`)).json();
    assert.ok(c.orders.some((o: { id: string }) => o.id === PROCESSING_ORDER));
    const off = await req(SALEM, 'PATCH', '/v1/driver/me/status', { status: 'offline' });
    assert.equal(off.json().driver.status, 'offline');
  });
});

describe('WhatsApp messaging', () => {
  const sent: { url: string; auth: string | null; body: Record<string, unknown> }[] = [];
  let wa: FastifyInstance;
  let failNext = false;

  before(async () => {
    wa = await buildApp({
      pool,
      config: loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: TEST_DB,
        AUTH_DEV_HEADER: 'true',
        MESSAGING_PROVIDER: 'whatsapp',
        WHATSAPP_TOKEN: 'test-token-not-real-0123456789',
        WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
        NOTIFY_ORDER_STATUS: 'true',
      }),
      logger: false,
      fetch: async (url, init) => {
        sent.push({
          url,
          auth: new Headers(init.headers).get('authorization'),
          body: JSON.parse(String(init.body)),
        });
        if (failNext) {
          failNext = false;
          return new Response('{"error":{"message":"bad"}}', { status: 400 });
        }
        return new Response(JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }), { status: 200 });
      },
    });
  });
  after(async () => wa?.close());

  it('builds the authentication template payload', () => {
    const p = buildWhatsAppOtpPayload({ otpTemplate: 'stylo_login_code', templateLang: 'ar' }, '+218910000004', '123456');
    assert.equal(p.to, '218910000004');
    assert.equal(p.template.name, 'stylo_login_code');
    assert.deepEqual(p.template.components[0], { type: 'body', parameters: [{ type: 'text', text: '123456' }] });
    assert.equal(p.template.components[1]!.sub_type, 'url');
  });

  it('sends the sign-in code by WhatsApp (and still shows it on screen in development)', async () => {
    const res = await wa.inject({ method: 'POST', url: '/v1/auth/otp/request', payload: { phone: '0910000021' } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().channel, 'whatsapp');
    const msg = sent.at(-1)!;
    assert.equal(msg.url, 'https://graph.facebook.com/v21.0/123456789012345/messages');
    assert.equal(msg.auth, 'Bearer test-token-not-real-0123456789');
    assert.equal(msg.body.to, '218910000021');
    const template = msg.body.template as { name: string; components: { parameters: { text: string }[] }[] };
    assert.equal(template.name, 'stylo_login_code');
    assert.equal(template.components[0]!.parameters[0]!.text, res.json().devCode);
    const log = await pool.query(`SELECT channel, purpose, status, provider_id FROM message_log ORDER BY id DESC LIMIT 1`);
    assert.deepEqual(log.rows[0], { channel: 'whatsapp', purpose: 'otp', status: 'sent', provider_id: `wamid.${sent.length}` });
  });

  it('a refused WhatsApp send is reported (503) and logged', async () => {
    failNext = true;
    const res = await wa.inject({ method: 'POST', url: '/v1/auth/otp/request', payload: { phone: '0910000022' } });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error.code, 'message_failed');
    const log = await pool.query(`SELECT status, error FROM message_log ORDER BY id DESC LIMIT 1`);
    assert.equal(log.rows[0].status, 'failed');
  });

  it('notifies the customer on WhatsApp when the order status changes', async () => {
    const pending = '50000000-0000-0000-0000-000000000001';
    const before = sent.length;
    const res = await wa.inject({
      method: 'POST',
      url: `/v1/admin/orders/${pending}/status`,
      payload: { to: 'confirmed' },
      headers: { 'x-user-id': OPS },
    });
    assert.equal(res.statusCode, 200, res.body);
    for (let i = 0; i < 50 && sent.length === before; i++) await new Promise((r) => setTimeout(r, 20));
    const msg = sent.at(-1)!;
    assert.equal(msg.body.to, '218910000004');
    const template = msg.body.template as { name: string; components: { parameters: { text: string }[] }[] };
    assert.equal(template.name, 'stylo_order_status');
    assert.deepEqual(
      template.components[0]!.parameters.map((p) => p.text),
      ['سارة', `#${res.json().orderNumber}`, 'مؤكد', res.json().store.name],
    );
  });
});
