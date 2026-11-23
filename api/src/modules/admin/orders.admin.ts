import { inTransaction, type Queryable } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import type { StaffContext } from './permissions.js';

/** The six statuses and allowed moves — mirrors order_status_can_transition() in 0001_init.sql. */
export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/** Store employees prepare orders; handing over to couriers and delivery is run by Stylo ops. */
const STORE_STAFF_TARGETS: readonly OrderStatus[] = ['confirmed', 'processing', 'cancelled'];

export function allowedNextStatuses(staff: StaffContext, from: OrderStatus): OrderStatus[] {
  const next = TRANSITIONS[from];
  return staff.storeId ? next.filter((s) => STORE_STAFF_TARGETS.includes(s)) : [...next];
}

/** Orders a staff member may see: store employees only see their store. */
function scope(staff: StaffContext, params: unknown[], alias = 'o'): string {
  if (!staff.storeId) return 'TRUE';
  return `${alias}.store_id = $${params.push(staff.storeId)}`;
}

const LIST_SELECT = `
  SELECT o.id, o.order_number, o.status, o.payment_status, o.currency, o.subtotal, o.shipping_fee, o.total,
         o.delivery_mode, o.placed_at, o.updated_at, o.estimated_delivery_at, o.cancel_reason,
         o.shipping_address->>'city' AS city,
         s.id AS store_id, s.name_ar AS store_name,
         c.id AS customer_id, c.full_name AS customer_name, c.phone AS customer_phone,
         d.user_id AS driver_id, du.full_name AS driver_name, du.phone AS driver_phone,
         (SELECT COALESCE(SUM(quantity), 0)::int FROM order_items oi WHERE oi.order_id = o.id) AS items_count
    FROM orders o
    JOIN stores s ON s.id = o.store_id
    JOIN users c ON c.id = o.customer_id
    LEFT JOIN drivers d ON d.user_id = o.driver_id
    LEFT JOIN users du ON du.id = d.user_id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrderRow(r: any) {
  return {
    id: r.id as string,
    orderNumber: r.order_number as number,
    status: r.status as OrderStatus,
    paymentStatus: r.payment_status as string,
    currency: r.currency as string,
    subtotal: r.subtotal as number,
    shippingFee: r.shipping_fee as number,
    total: r.total as number,
    deliveryMode: r.delivery_mode as string,
    city: r.city as string | null,
    placedAt: (r.placed_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
    estimatedDeliveryAt: r.estimated_delivery_at ? (r.estimated_delivery_at as Date).toISOString() : null,
    cancelReason: r.cancel_reason as string | null,
    itemsCount: r.items_count as number,
    store: { id: r.store_id as string, name: r.store_name as string },
    customer: { id: r.customer_id as string, name: r.customer_name as string, phone: r.customer_phone as string | null },
    driver: r.driver_id
      ? { id: r.driver_id as string, name: r.driver_name as string, phone: r.driver_phone as string | null }
      : null,
  };
}

export async function listOrders(
  ctx: Ctx,
  staff: StaffContext,
  q: { status?: OrderStatus; storeId?: string; search?: string; limit: number; offset: number },
) {
  const params: unknown[] = [];
  const where = [scope(staff, params)];
  if (q.status) where.push(`o.status = $${params.push(q.status)}`);
  if (q.storeId) where.push(`o.store_id = $${params.push(q.storeId)}`);
  if (q.search) {
    const term = q.search.replace(/^#/, '');
    if (/^\d+$/.test(term)) where.push(`o.order_number = $${params.push(Number(term))}`);
    else {
      const like = `$${params.push(`%${term.replace(/[\\%_]/g, (m) => '\\' + m)}%`)}`;
      where.push(`(c.full_name ILIKE ${like} OR c.phone ILIKE ${like} OR s.name_ar ILIKE ${like})`);
    }
  }
  const whereSql = where.join(' AND ');
  const [list, count] = await Promise.all([
    ctx.db.query(
      `${LIST_SELECT} WHERE ${whereSql} ORDER BY o.placed_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.limit, q.offset],
    ),
    ctx.db.query(
      `SELECT count(*)::int AS n FROM orders o JOIN stores s ON s.id = o.store_id JOIN users c ON c.id = o.customer_id
        WHERE ${whereSql}`,
      params,
    ),
  ]);
  return { items: list.rows.map(mapOrderRow), total: count.rows[0].n as number };
}

async function findScopedOrder(db: Queryable, staff: StaffContext, id: string, lock = false) {
  const params: unknown[] = [id];
  const { rows } = await db.query(
    `${LIST_SELECT} WHERE o.id = $1 AND ${scope(staff, params)} ${lock ? 'FOR UPDATE OF o' : ''}`,
    params,
  );
  if (!rows[0]) throw notFound('الطلب');
  return rows[0];
}

export async function getOrder(ctx: Ctx, staff: StaffContext, id: string) {
  const row = await findScopedOrder(ctx.db, staff, id);
  const order = mapOrderRow(row);
  const [items, history, address] = await Promise.all([
    ctx.db.query(
      `SELECT id, product_name_ar, sku, size, color_name_ar, unit_price, quantity, line_total
         FROM order_items WHERE order_id = $1 ORDER BY product_name_ar`,
      [id],
    ),
    ctx.db.query(
      `SELECT h.from_status, h.to_status, h.note, h.changed_at, u.full_name AS changed_by
         FROM order_status_history h LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.order_id = $1 ORDER BY h.id`,
      [id],
    ),
    ctx.db.query(`SELECT shipping_address FROM orders WHERE id = $1`, [id]),
  ]);
  return {
    ...order,
    shippingAddress: address.rows[0].shipping_address as Record<string, string>,
    items: items.rows.map((r) => ({
      id: r.id as string,
      name: r.product_name_ar as string,
      sku: r.sku as string,
      size: r.size as string | null,
      colorName: r.color_name_ar as string | null,
      unitPrice: r.unit_price as number,
      quantity: r.quantity as number,
      lineTotal: r.line_total as number,
    })),
    history: history.rows.map((r) => ({
      from: r.from_status as OrderStatus | null,
      to: r.to_status as OrderStatus,
      note: r.note as string | null,
      at: (r.changed_at as Date).toISOString(),
      by: r.changed_by as string | null,
    })),
    allowedNext: allowedNextStatuses(staff, order.status),
  };
}

/** Driver is free again once none of their orders are still out for delivery. */
async function refreshDriverStatus(db: Queryable, driverId: string) {
  await db.query(
    `UPDATE drivers SET status = CASE
        WHEN EXISTS (SELECT 1 FROM orders WHERE driver_id = $1 AND status = 'shipped') THEN 'busy'::driver_status
        WHEN status = 'busy' THEN 'available'::driver_status
        ELSE status END
      WHERE user_id = $1`,
    [driverId],
  );
}

export async function changeOrderStatus(
  ctx: Ctx,
  staff: StaffContext,
  id: string,
  input: { to: OrderStatus; note?: string; cancelReason?: string },
) {
  await inTransaction(ctx.db, async (db) => {
    const row = await findScopedOrder(db, staff, id, true);
    const from = row.status as OrderStatus;

    if (!TRANSITIONS[from].includes(input.to)) {
      throw badRequest('invalid_transition', `لا يمكن نقل الطلب من «${STATUS_AR[from]}» إلى «${STATUS_AR[input.to]}»`);
    }
    if (!allowedNextStatuses(staff, from).includes(input.to)) {
      throw forbidden('موظفو المتجر يؤكدون الطلب ويجهّزونه فقط؛ الشحن والتسليم من فريق ستايلو');
    }
    if (input.to === 'shipped' && !row.driver_id) {
      throw badRequest('driver_required', 'أسندي الطلب لسائق قبل تحويله إلى «تم الشحن»');
    }
    if (input.to === 'cancelled' && !input.cancelReason?.trim()) {
      throw badRequest('cancel_reason_required', 'اكتبي سبب الإلغاء');
    }

    // Read by the status trigger → recorded in order_status_history.
    await db.query(`SELECT set_config('stylo.actor_id', $1, true), set_config('stylo.status_note', $2, true)`, [
      staff.userId,
      input.note?.trim() ?? '',
    ]);
    await db.query(
      `UPDATE orders SET status = $2::order_status,
              cancel_reason = CASE WHEN $2::order_status = 'cancelled' THEN $3::text ELSE cancel_reason END,
              payment_status = CASE WHEN $2::order_status = 'delivered' AND payment_status = 'unpaid'
                                    THEN 'paid'::payment_status ELSE payment_status END
        WHERE id = $1`,
      [id, input.to, input.cancelReason?.trim() ?? null],
    );

    if (input.to === 'cancelled') {
      // Put the items back on the shelf.
      await db.query(
        `UPDATE product_variants v SET stock_qty = v.stock_qty + oi.quantity
           FROM order_items oi WHERE oi.order_id = $1 AND oi.variant_id = v.id`,
        [id],
      );
      await db.query(
        `UPDATE products p SET sold_count = GREATEST(0, p.sold_count - x.qty)
           FROM (SELECT v.product_id, SUM(oi.quantity) AS qty FROM order_items oi
                   JOIN product_variants v ON v.id = oi.variant_id WHERE oi.order_id = $1 GROUP BY 1) x
          WHERE p.id = x.product_id`,
        [id],
      );
    }
    if (row.driver_id) await refreshDriverStatus(db, row.driver_id);
  });
  return getOrder(ctx, staff, id);
}

export async function assignDriver(ctx: Ctx, staff: StaffContext, id: string, driverId: string) {
  await inTransaction(ctx.db, async (db) => {
    const row = await findScopedOrder(db, staff, id, true);
    if (!['confirmed', 'processing'].includes(row.status)) {
      throw conflict('not_assignable', 'يمكن إسناد الطلب لسائق بعد تأكيده وقبل شحنه');
    }
    const { rows } = await db.query(`SELECT status, is_active FROM drivers WHERE user_id = $1 FOR UPDATE`, [driverId]);
    const driver = rows[0];
    if (!driver) throw notFound('السائق');
    if (!driver.is_active || driver.status === 'offline') {
      throw conflict('driver_unavailable', 'السائق غير متاح حالياً');
    }
    await db.query(`UPDATE orders SET driver_id = $2, assigned_at = now() WHERE id = $1`, [id, driverId]);
    if (row.driver_id && row.driver_id !== driverId) await refreshDriverStatus(db, row.driver_id);
  });
  return getOrder(ctx, staff, id);
}

export const STATUS_AR: Record<OrderStatus, string> = {
  pending: 'قيد الانتظار',
  confirmed: 'مؤكد',
  processing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
};
