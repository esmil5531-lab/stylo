import { inTransaction, type Queryable } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { conflict, forbidden, notFound, unauthorized } from '../../lib/errors.js';
import { refreshDriverStatus, STATUS_AR, type OrderStatus } from '../admin/orders.admin.js';
import { failureNote, type DeliveryFailure } from '../orders/delivery-failure.js';
import { restockOrder } from '../orders/restock.js';

/**
 * Driver mode (وضع المندوب) inside the Stylo app. A driver signs in with their phone like everyone
 * else; these routes only answer for an active row in `drivers`.
 *
 * Drivers never see commission or store dues: only what to pick up, where to go, and how much cash
 * to collect (the order total). Their custody = cash collected and not yet handed over.
 */

const TZ = 'Africa/Tripoli';

export interface DriverCtx {
  id: string;
  name: string;
  phone: string | null;
  city: string;
  vehicle: string;
  status: 'available' | 'busy' | 'offline';
}

export async function loadDriver(ctx: Ctx): Promise<DriverCtx> {
  if (!ctx.userId) throw unauthorized();
  const { rows } = await ctx.db.query(
    `SELECT d.user_id, u.full_name, u.phone, d.city, d.vehicle, d.status, d.is_active
       FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.user_id = $1`,
    [ctx.userId],
  );
  const r = rows[0];
  if (!r || !r.is_active) throw forbidden('هذا الحساب ليس حساب مندوب توصيل مفعّل');
  return { id: r.user_id, name: r.full_name, phone: r.phone, city: r.city, vehicle: r.vehicle, status: r.status };
}

export async function getDriverHome(ctx: Ctx, driver: DriverCtx) {
  const [custody, today, last, pending] = await Promise.all([
    ctx.db.query(
      `SELECT count(*)::int AS n, COALESCE(SUM(o.total), 0)::bigint AS amount, MIN(o.cash_collected_at) AS since
         FROM orders o
        WHERE o.driver_id = $1 AND o.payment_method = 'cod' AND o.cash_collected_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM driver_settlement_orders x WHERE x.order_id = o.id)`,
      [driver.id],
    ),
    ctx.db.query(
      `SELECT count(*) FILTER (WHERE o.status = 'delivered')::int AS delivered,
              count(*) FILTER (WHERE o.status IN ('confirmed', 'processing', 'shipped'))::int AS active
         FROM orders o
        WHERE o.driver_id = $1
          AND (o.status IN ('confirmed', 'processing', 'shipped')
               OR (o.cash_collected_at AT TIME ZONE '${TZ}')::date = ($2::timestamptz AT TIME ZONE '${TZ}')::date)`,
      [driver.id, ctx.now],
    ),
    ctx.db.query(
      `SELECT ds.settled_at, ds.amount_received, u.full_name AS received_by
         FROM driver_settlements ds JOIN users u ON u.id = ds.received_by
        WHERE ds.driver_id = $1 ORDER BY ds.settled_at DESC LIMIT 1`,
      [driver.id],
    ),
    // Cash still to collect: cash-on-delivery orders assigned to the driver and not delivered yet.
    ctx.db.query(
      `SELECT count(*)::int AS n, COALESCE(SUM(o.total), 0)::bigint AS amount
         FROM orders o
        WHERE o.driver_id = $1 AND o.payment_method = 'cod' AND o.status IN ('confirmed', 'processing', 'shipped')`,
      [driver.id],
    ),
  ]);
  const c = custody.rows[0];
  const l = last.rows[0];
  return {
    driver,
    custody: {
      ordersCount: c.n as number,
      amount: Number(c.amount),
      since: c.since ? (c.since as Date).toISOString() : null,
    },
    today: { delivered: today.rows[0].delivered as number, active: today.rows[0].active as number },
    toCollect: { ordersCount: pending.rows[0].n as number, amount: Number(pending.rows[0].amount) },
    lastSettlement: l
      ? { at: (l.settled_at as Date).toISOString(), amountReceived: Number(l.amount_received), receivedBy: l.received_by }
      : null,
  };
}

export async function setDriverStatus(ctx: Ctx, driver: DriverCtx, status: 'available' | 'offline') {
  const { rows } = await ctx.db.query(
    `SELECT 1 FROM orders WHERE driver_id = $1 AND status = 'shipped' LIMIT 1`,
    [driver.id],
  );
  if (rows[0] && status === 'offline') {
    throw conflict('has_active_delivery', 'لديك طلب قيد التوصيل. سلّميه أولاً ثم غيّري حالتك');
  }
  // While a parcel is on the road the driver stays «في توصيلة».
  await ctx.db.query(`UPDATE drivers SET status = $2::driver_status WHERE user_id = $1`, [
    driver.id,
    rows[0] ? 'busy' : status,
  ]);
  return getDriverHome(ctx, await loadDriver(ctx));
}

const ORDER_SELECT = `
  SELECT o.id, o.order_number, o.status, o.payment_method, o.payment_status, o.total, o.delivery_mode,
         o.delivery_failure, o.cancel_reason,
         o.shipping_address, o.placed_at, o.estimated_delivery_at, o.cash_collected_at, o.assigned_at,
         s.name_ar AS store_name, s.phone AS store_phone, s.city AS store_city, s.district AS store_district,
         s.address_line AS store_address,
         c.full_name AS customer_name, COALESCE(o.shipping_address->>'phone', c.phone) AS customer_phone,
         (SELECT COALESCE(json_agg(json_build_object('name', oi.product_name_ar, 'size', oi.size,
                                                     'color', oi.color_name_ar, 'quantity', oi.quantity)
                                   ORDER BY oi.product_name_ar), '[]'::json)
            FROM order_items oi WHERE oi.order_id = o.id) AS items
    FROM orders o
    JOIN stores s ON s.id = o.store_id
    JOIN users c ON c.id = o.customer_id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDriverOrder(r: any) {
  const addr = (r.shipping_address ?? {}) as Record<string, string>;
  const cod = r.payment_method === 'cod';
  return {
    id: r.id as string,
    orderNumber: Number(r.order_number),
    status: r.status as OrderStatus,
    statusLabel: STATUS_AR[r.status as OrderStatus],
    deliveryMode: r.delivery_mode as string,
    /** «أسرع توصيل»: the customer paid for priority — deliver these first. */
    isExpress: r.delivery_mode === 'fastest',
    paymentMethod: r.payment_method as 'cod' | 'online',
    /** Cash to collect from the customer (0 for paid-online orders). */
    amountToCollect: cod ? Number(r.total) : 0,
    cashCollectedAt: r.cash_collected_at ? (r.cash_collected_at as Date).toISOString() : null,
    placedAt: (r.placed_at as Date).toISOString(),
    estimatedDeliveryAt: r.estimated_delivery_at ? (r.estimated_delivery_at as Date).toISOString() : null,
    pickup: {
      storeName: r.store_name as string,
      phone: r.store_phone as string | null,
      city: r.store_city as string,
      district: r.store_district as string | null,
      address: r.store_address as string | null,
    },
    dropoff: {
      name: (addr.recipient_name ?? r.customer_name) as string,
      phone: r.customer_phone as string | null,
      city: addr.city ?? null,
      district: addr.district ?? null,
      street: addr.street ?? null,
      building: addr.building ?? null,
      landmark: addr.landmark ?? null,
    },
    items: r.items as { name: string; size: string | null; color: string | null; quantity: number }[],
    canPickUp: r.status === 'processing',
    canDeliver: r.status === 'shipped',
    /** «تعذّر التسليم»: only while the parcel is with the driver. */
    canFail: r.status === 'shipped',
    /** Failed delivery: the reason (the pieces go back to the store). */
    failure: r.delivery_failure ? (r.cancel_reason as string) : null,
  };
}

export async function listDriverOrders(ctx: Ctx, driver: DriverCtx) {
  const { rows } = await ctx.db.query(
    `${ORDER_SELECT}
      WHERE o.driver_id = $1
        AND (o.status IN ('confirmed', 'processing', 'shipped')
             OR (o.status = 'delivered'
                 AND (o.cash_collected_at AT TIME ZONE '${TZ}')::date = ($2::timestamptz AT TIME ZONE '${TZ}')::date)
             -- failed today: the driver still has to take the pieces back to the store
             OR (o.status = 'cancelled' AND o.delivery_failure IS NOT NULL
                 AND (o.updated_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date))
      ORDER BY CASE o.status WHEN 'shipped' THEN 0 WHEN 'processing' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END,
               o.cash_collected_at DESC NULLS LAST,
               (o.delivery_mode = 'fastest') DESC, o.estimated_delivery_at NULLS LAST, o.assigned_at`,
    [driver.id, ctx.now],
  );
  const orders = rows.map(mapDriverOrder);
  return {
    active: orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'),
    deliveredToday: orders.filter((o) => o.status === 'delivered'),
    /** Failed today: return the pieces to the store. */
    returnToStore: orders.filter((o) => o.status === 'cancelled'),
  };
}

async function moveOrder(db: Queryable, ctx: Ctx, driver: DriverCtx, id: string, from: OrderStatus, to: OrderStatus) {
  const { rows } = await db.query(`SELECT status, driver_id FROM orders WHERE id = $1 FOR UPDATE`, [id]);
  const o = rows[0];
  if (!o || o.driver_id !== driver.id) throw notFound('الطلب');
  if (o.status !== from) {
    throw conflict('invalid_transition', `الطلب الآن «${STATUS_AR[o.status as OrderStatus]}»`);
  }
  await db.query(`SELECT set_config('stylo.actor_id', $1, true), set_config('stylo.status_note', $2, true)`, [
    driver.id,
    to === 'shipped' ? 'استلمه المندوب من المتجر' : 'سلّمه المندوب للزبون',
  ]);
  await db.query(
    `UPDATE orders SET status = $2::order_status,
            payment_status = CASE WHEN $2::order_status = 'delivered' AND payment_status = 'unpaid'
                                  THEN 'paid'::payment_status ELSE payment_status END,
            cash_collected_at = CASE WHEN $2::order_status = 'delivered' AND payment_method = 'cod'
                                     THEN $3::timestamptz ELSE cash_collected_at END
      WHERE id = $1`,
    [id, to, ctx.now],
  );
  await refreshDriverStatus(db, driver.id);
}

export async function pickUpOrder(ctx: Ctx, driver: DriverCtx, id: string) {
  await inTransaction(ctx.db, (db) => moveOrder(db, ctx, driver, id, 'processing', 'shipped'));
  return getDriverOrder(ctx, driver, id);
}

export async function deliverOrder(ctx: Ctx, driver: DriverCtx, id: string) {
  await inTransaction(ctx.db, (db) => moveOrder(db, ctx, driver, id, 'shipped', 'delivered'));
  return getDriverOrder(ctx, driver, id);
}

export async function getDriverOrder(ctx: Ctx, driver: DriverCtx, id: string) {
  const { rows } = await ctx.db.query(`${ORDER_SELECT} WHERE o.id = $1 AND o.driver_id = $2`, [id, driver.id]);
  if (!rows[0]) throw notFound('الطلب');
  return mapDriverOrder(rows[0]);
}

/**
 * «تعذّر التسليم»: the customer did not answer, refused, wrong address or asked to postpone.
 * shipped → cancelled with the reason (required, from the list) + an optional note; the items go
 * back to stock, no cash is collected, and the reason shows in the order history (Stylo + store).
 */
export async function failDelivery(ctx: Ctx, driver: DriverCtx, id: string, reason: DeliveryFailure, note?: string) {
  await inTransaction(ctx.db, async (db) => {
    const { rows } = await db.query(`SELECT status, driver_id FROM orders WHERE id = $1 FOR UPDATE`, [id]);
    const o = rows[0];
    if (!o || o.driver_id !== driver.id) throw notFound('الطلب');
    if (o.status !== 'shipped') {
      throw conflict('invalid_transition', `الطلب الآن «${STATUS_AR[o.status as OrderStatus]}»`);
    }
    const text = failureNote(reason, note);
    await db.query(`SELECT set_config('stylo.actor_id', $1, true), set_config('stylo.status_note', $2, true)`, [
      driver.id,
      text,
    ]);
    await db.query(
      `UPDATE orders SET status = 'cancelled', delivery_failure = $2, cancel_reason = $3 WHERE id = $1`,
      [id, reason, text],
    );
    await restockOrder(db, id);
    await refreshDriverStatus(db, driver.id);
  });
  return getDriverOrder(ctx, driver, id);
}
