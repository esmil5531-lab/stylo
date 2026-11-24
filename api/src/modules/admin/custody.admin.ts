import { inTransaction, type Queryable } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import type { StaffContext } from './permissions.js';

/**
 * Driver cash custody (عُهدة المناديب).
 *
 * Cash-on-delivery orders: when a driver delivers, they collect the order total (merchandise +
 * delivery fee) — `orders.cash_collected_at`. That cash is in the driver's custody until a staff
 * member receives it and closes the custody (تقفيل العُهدة): a `driver_settlements` row records the
 * amount expected, the amount actually received, who received it and when. Each order is settled once
 * (`driver_settlement_orders.order_id` UNIQUE), so the driver's custody goes back to zero.
 *
 * Per-store breakdown: what each store is owed from that cash = subtotal − commission (store net).
 * Commission itself is stripped from responses for anyone without `finance.view` (general manager only).
 */

/** Delivered COD orders whose cash has not been handed over yet. `$1` = driver id. */
const UNSETTLED = `
  FROM orders o
  JOIN stores s ON s.id = o.store_id
  JOIN users c ON c.id = o.customer_id
 WHERE o.driver_id = $1
   AND o.payment_method = 'cod'
   AND o.cash_collected_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM driver_settlement_orders x WHERE x.order_id = o.id)`;

export async function listCustody(ctx: Ctx) {
  const { rows } = await ctx.db.query(
    `SELECT d.user_id AS id, u.full_name, u.phone, d.city, d.vehicle, d.status, d.is_active,
            COALESCE(c.orders_count, 0)::int AS orders_count, COALESCE(c.amount, 0)::bigint AS amount,
            COALESCE(c.stores_count, 0)::int AS stores_count, c.since,
            ls.settled_at AS last_settled_at, ls.amount_received AS last_amount, lu.full_name AS last_received_by
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       LEFT JOIN LATERAL (
         SELECT count(*) AS orders_count, SUM(o.total) AS amount, count(DISTINCT o.store_id) AS stores_count,
                MIN(o.cash_collected_at) AS since
           FROM orders o
          WHERE o.driver_id = d.user_id AND o.payment_method = 'cod' AND o.cash_collected_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM driver_settlement_orders x WHERE x.order_id = o.id)
       ) c ON true
       LEFT JOIN LATERAL (
         SELECT settled_at, amount_received, received_by FROM driver_settlements
          WHERE driver_id = d.user_id ORDER BY settled_at DESC LIMIT 1
       ) ls ON true
       LEFT JOIN users lu ON lu.id = ls.received_by
      WHERE d.is_active OR COALESCE(c.orders_count, 0) > 0
      ORDER BY COALESCE(c.amount, 0) DESC, u.full_name`,
  );
  const items = rows.map((r) => ({
    driver: {
      id: r.id as string,
      name: r.full_name as string,
      phone: r.phone as string | null,
      city: r.city as string,
      vehicle: r.vehicle as string,
      status: r.status as string,
    },
    ordersCount: r.orders_count as number,
    storesCount: r.stores_count as number,
    amount: r.amount as number,
    since: r.since ? (r.since as Date).toISOString() : null,
    lastSettlement: r.last_settled_at
      ? {
          at: (r.last_settled_at as Date).toISOString(),
          amountReceived: r.last_amount as number,
          receivedBy: r.last_received_by as string | null,
        }
      : null,
  }));
  return { items, total: items.reduce((s, i) => s + i.amount, 0) };
}

async function loadDriver(db: Queryable, driverId: string) {
  const { rows } = await db.query(
    `SELECT d.user_id AS id, u.full_name, u.phone, d.city, d.vehicle, d.status
       FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.user_id = $1`,
    [driverId],
  );
  if (!rows[0]) throw notFound('المندوب');
  const r = rows[0];
  return {
    id: r.id as string,
    name: r.full_name as string,
    phone: r.phone as string | null,
    city: r.city as string,
    vehicle: r.vehicle as string,
    status: r.status as string,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCustodyOrder(r: any) {
  return {
    id: r.id as string,
    orderNumber: Number(r.order_number),
    store: { id: r.store_id as string, name: r.store_name as string },
    customerName: r.customer_name as string,
    collectedAt: (r.cash_collected_at as Date).toISOString(),
    /** Cash the driver collected = what they must hand over. */
    total: Number(r.total),
    subtotal: Number(r.subtotal),
    deliveryFee: Number(r.shipping_fee),
    commission: Number(r.commission_amount),
    /** What Stylo owes the store from this order. */
    storeNet: Number(r.subtotal) - Number(r.commission_amount),
  };
}

type CustodyOrder = ReturnType<typeof mapCustodyOrder>;

/**
 * Without finance.view (general manager only), keep just the cash and each store's net: subtotal,
 * delivery fees and commission would let anyone subtract their way to the commission.
 */
function shape(finance: boolean, data: { orders: CustodyOrder[] } & ReturnType<typeof breakdown>) {
  if (finance) return data;
  return {
    orders: data.orders.map(({ id, orderNumber, store, customerName, collectedAt, total, storeNet }) => ({
      id,
      orderNumber,
      store,
      customerName,
      collectedAt,
      total,
      storeNet,
    })),
    byStore: data.byStore.map(({ store, ordersCount, collected, storeNet }) => ({ store, ordersCount, collected, storeNet })),
    totals: { ordersCount: data.totals.ordersCount, amount: data.totals.amount, storeNet: data.totals.storeNet },
  };
}

function breakdown(orders: CustodyOrder[]) {
  const byStore = new Map<
    string,
    { store: { id: string; name: string }; ordersCount: number; collected: number; storeNet: number; deliveryFees: number; commission: number }
  >();
  for (const o of orders) {
    const b = byStore.get(o.store.id) ?? {
      store: o.store,
      ordersCount: 0,
      collected: 0,
      storeNet: 0,
      deliveryFees: 0,
      commission: 0,
    };
    b.ordersCount += 1;
    b.collected += o.total;
    b.storeNet += o.storeNet;
    b.deliveryFees += o.deliveryFee;
    b.commission += o.commission;
    byStore.set(o.store.id, b);
  }
  const stores = [...byStore.values()].sort((a, b) => b.collected - a.collected);
  const sum = (k: 'collected' | 'storeNet' | 'deliveryFees' | 'commission') => stores.reduce((s, b) => s + b[k], 0);
  return {
    byStore: stores,
    totals: {
      ordersCount: orders.length,
      amount: sum('collected'),
      storeNet: sum('storeNet'),
      deliveryFees: sum('deliveryFees'),
      commission: sum('commission'),
    },
  };
}

async function unsettledOrders(db: Queryable, driverId: string, lock = false) {
  const { rows } = await db.query(
    `SELECT o.id, o.order_number, o.store_id, s.name_ar AS store_name, c.full_name AS customer_name,
            o.cash_collected_at, o.total, o.subtotal, o.shipping_fee, o.commission_amount
       ${UNSETTLED}
      ORDER BY o.cash_collected_at ${lock ? 'FOR UPDATE OF o' : ''}`,
    [driverId],
  );
  return rows.map(mapCustodyOrder);
}

export async function getDriverCustody(ctx: Ctx, staff: StaffContext, driverId: string) {
  const driver = await loadDriver(ctx.db, driverId);
  const orders = await unsettledOrders(ctx.db, driverId);
  return { driver, ...shape(staff.permissions.has('finance.view'), { orders, ...breakdown(orders) }) };
}

export interface SettleInput {
  driverId: string;
  amountReceived: number;
  /** The total the staff member saw on screen; refuses if new cash arrived meanwhile. */
  expectedAmount?: number;
  note?: string;
}

export async function settleCustody(ctx: Ctx, staff: StaffContext, input: SettleInput) {
  const id = await inTransaction(ctx.db, async (db) => {
    // One settlement at a time per driver.
    const d = await db.query(`SELECT user_id FROM drivers WHERE user_id = $1 FOR UPDATE`, [input.driverId]);
    if (!d.rows[0]) throw notFound('المندوب');

    const orders = await unsettledOrders(db, input.driverId, true);
    if (orders.length === 0) throw conflict('nothing_to_settle', 'لا توجد مبالغ في عُهدة هذا المندوب');
    const expected = orders.reduce((s, o) => s + o.total, 0);
    if (input.expectedAmount !== undefined && input.expectedAmount !== expected) {
      throw conflict('custody_changed', 'تغيّرت عُهدة المندوب (وصل طلب جديد). راجعي المبلغ ثم أعيدي التقفيل', {
        expected,
      });
    }
    const note = input.note?.trim() || null;
    if (input.amountReceived !== expected && !note) {
      throw badRequest('note_required', 'المبلغ المستلم يختلف عن المطلوب، اكتبي سبب الفرق في الملاحظة');
    }

    const ins = await db.query(
      `INSERT INTO driver_settlements (driver_id, orders_count, amount_expected, amount_received, note, received_by, settled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [input.driverId, orders.length, expected, input.amountReceived, note, staff.userId, ctx.now],
    );
    const settlementId = ins.rows[0].id as string;
    await db.query(
      `INSERT INTO driver_settlement_orders (settlement_id, order_id, amount)
       SELECT $1, x.id, x.total FROM unnest($2::uuid[], $3::bigint[]) AS x(id, total)`,
      [settlementId, orders.map((o) => o.id), orders.map((o) => o.total)],
    );
    return settlementId;
  });
  return getSettlement(ctx, staff, id);
}

const SETTLEMENT_SELECT = `
  SELECT ds.id, ds.number, ds.driver_id, du.full_name AS driver_name, du.phone AS driver_phone,
         ds.orders_count, ds.amount_expected, ds.amount_received, ds.difference, ds.note,
         ds.received_by, ru.full_name AS received_by_name, ds.settled_at
    FROM driver_settlements ds
    JOIN users du ON du.id = ds.driver_id
    JOIN users ru ON ru.id = ds.received_by`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSettlement(r: any) {
  return {
    id: r.id as string,
    number: Number(r.number),
    driver: { id: r.driver_id as string, name: r.driver_name as string, phone: r.driver_phone as string | null },
    ordersCount: r.orders_count as number,
    amountExpected: Number(r.amount_expected),
    amountReceived: Number(r.amount_received),
    difference: Number(r.difference),
    note: r.note as string | null,
    receivedBy: { id: r.received_by as string, name: r.received_by_name as string },
    settledAt: (r.settled_at as Date).toISOString(),
  };
}

export async function listSettlements(ctx: Ctx, q: { driverId?: string; limit: number }) {
  const { rows } = await ctx.db.query(
    `${SETTLEMENT_SELECT} WHERE ($1::uuid IS NULL OR ds.driver_id = $1::uuid)
      ORDER BY ds.settled_at DESC LIMIT $2`,
    [q.driverId ?? null, q.limit],
  );
  return rows.map(mapSettlement);
}

export async function getSettlement(ctx: Ctx, staff: StaffContext, id: string) {
  const { rows } = await ctx.db.query(`${SETTLEMENT_SELECT} WHERE ds.id = $1`, [id]);
  if (!rows[0]) throw notFound('التقفيل');
  const orders = await ctx.db.query(
    `SELECT o.id, o.order_number, o.store_id, s.name_ar AS store_name, c.full_name AS customer_name,
            o.cash_collected_at, o.total, o.subtotal, o.shipping_fee, o.commission_amount
       FROM driver_settlement_orders x
       JOIN orders o ON o.id = x.order_id
       JOIN stores s ON s.id = o.store_id
       JOIN users c ON c.id = o.customer_id
      WHERE x.settlement_id = $1 ORDER BY o.cash_collected_at`,
    [id],
  );
  const list = orders.rows.map(mapCustodyOrder);
  return { ...mapSettlement(rows[0]), ...shape(staff.permissions.has('finance.view'), { orders: list, ...breakdown(list) }) };
}
