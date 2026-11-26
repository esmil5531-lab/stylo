import { inTransaction, type Queryable } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import type { StaffContext } from './permissions.js';

/**
 * «المرتجعات» — pieces of a DELIVERED order that come back, recorded by Stylo staff.
 * - Only within RETURN_WINDOW_DAYS of the delivery (the published returns policy).
 * - Never more pieces than were ordered minus those already returned.
 * - Restocked unless the reason is «عيب أو تلف» (or staff untick it).
 * - The customer is refunded the merchandise (not the delivery fee). The store's next payout
 *   deducts the amount and gives back Stylo's commission on it (the order's own rate).
 */
export const RETURN_REASONS = ['wrong_size', 'defective', 'not_as_described', 'changed_mind', 'other'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export const RETURN_REASON_AR: Record<ReturnReason, string> = {
  wrong_size: 'المقاس غير مناسب',
  defective: 'عيب أو تلف',
  not_as_described: 'لا يطابق الوصف أو الصور',
  changed_mind: 'غيّر رأيه',
  other: 'سبب آخر',
};

export interface ReturnInput {
  items: { orderItemId: string; quantity: number }[];
  reason: ReturnReason;
  note?: string;
  /** Default: true, except for defective pieces. */
  restock?: boolean;
}

export interface OrderReturn {
  id: string;
  number: number;
  reason: ReturnReason;
  reasonLabel: string;
  note: string | null;
  restocked: boolean;
  amount: number;
  commission: number;
  settled: boolean;
  createdAt: string;
  createdBy: string | null;
  items: { orderItemId: string; name: string; size: string | null; colorName: string | null; quantity: number; amount: number }[];
}

/** Returns of one order (with their pieces), newest first. */
export async function listOrderReturns(db: Queryable, orderId: string): Promise<OrderReturn[]> {
  const { rows } = await db.query(
    `SELECT r.id, r.number, r.reason, r.note, r.restocked, r.amount, r.commission_amount, r.payout_id,
            r.created_at, u.full_name AS created_by,
            COALESCE(json_agg(json_build_object(
              'orderItemId', oi.id, 'name', oi.product_name_ar, 'size', oi.size, 'colorName', oi.color_name_ar,
              'quantity', ri.quantity, 'amount', ri.amount) ORDER BY oi.product_name_ar), '[]') AS items
       FROM order_returns r
       JOIN order_return_items ri ON ri.return_id = r.id
       JOIN order_items oi ON oi.id = ri.order_item_id
       LEFT JOIN users u ON u.id = r.created_by
      WHERE r.order_id = $1
      GROUP BY r.id, u.full_name
      ORDER BY r.created_at DESC`,
    [orderId],
  );
  return rows.map((r) => ({
    id: r.id,
    number: Number(r.number),
    reason: r.reason,
    reasonLabel: RETURN_REASON_AR[r.reason as ReturnReason],
    note: r.note,
    restocked: r.restocked,
    amount: Number(r.amount),
    commission: Number(r.commission_amount),
    settled: r.payout_id !== null,
    createdAt: (r.created_at as Date).toISOString(),
    createdBy: r.created_by,
    items: (r.items as OrderReturn['items']).map((i) => ({ ...i, amount: Number(i.amount) })),
  }));
}

/** Pieces already returned per order line. */
export async function returnedQuantities(db: Queryable, orderId: string): Promise<Map<string, number>> {
  const { rows } = await db.query(
    `SELECT ri.order_item_id, SUM(ri.quantity)::int AS qty
       FROM order_return_items ri JOIN order_returns r ON r.id = ri.return_id
      WHERE r.order_id = $1 GROUP BY 1`,
    [orderId],
  );
  return new Map(rows.map((r) => [r.order_item_id as string, r.qty as number]));
}

/** Until when a return can still be recorded (null: not delivered). */
export async function returnDeadline(db: Queryable, orderId: string, windowDays: number): Promise<Date | null> {
  const { rows } = await db.query(
    `SELECT max(changed_at) AS at FROM order_status_history WHERE order_id = $1 AND to_status = 'delivered'`,
    [orderId],
  );
  const at = rows[0]?.at as Date | null;
  return at ? new Date(at.getTime() + windowDays * 86_400_000) : null;
}

export async function createReturn(ctx: Ctx, staff: StaffContext, orderId: string, input: ReturnInput): Promise<OrderReturn> {
  const windowDays = ctx.config.returns.windowDays;
  const id = await inTransaction(ctx.db, async (db) => {
    const params: unknown[] = [orderId];
    const storeScope = staff.storeId ? `AND store_id = $${params.push(staff.storeId)}` : '';
    const { rows } = await db.query(
      `SELECT id, status, store_id, commission_bps FROM orders WHERE id = $1 ${storeScope} FOR UPDATE`,
      params,
    );
    const order = rows[0];
    if (!order) throw notFound('الطلب');
    if (order.status !== 'delivered') throw conflict('not_delivered', 'الإرجاع يُسجَّل للطلبات المسلّمة فقط');
    const deadline = await returnDeadline(db, orderId, windowDays);
    if (!deadline || deadline < ctx.now) {
      throw conflict('return_window_passed', `انتهت مدة الإرجاع (${windowDays} أيام من التسليم) لهذا الطلب`, {
        deadline: deadline?.toISOString() ?? null,
      });
    }

    // Each piece at most once: ordered − already returned.
    const lines = await db.query(
      `SELECT id, variant_id, unit_price, quantity FROM order_items WHERE order_id = $1 FOR UPDATE`,
      [orderId],
    );
    const byId = new Map(lines.rows.map((l) => [l.id as string, l]));
    const returned = await returnedQuantities(db, orderId);
    const merged = new Map<string, number>();
    for (const i of input.items) merged.set(i.orderItemId, (merged.get(i.orderItemId) ?? 0) + i.quantity);
    let amount = 0;
    for (const [itemId, qty] of merged) {
      const line = byId.get(itemId);
      if (!line) throw badRequest('unknown_item', 'هذه القطعة ليست في الطلب');
      const left = line.quantity - (returned.get(itemId) ?? 0);
      if (qty > left) {
        throw conflict('too_many_returned', left === 0 ? 'أُرجعت هذه القطعة من قبل' : `المتبقي للإرجاع من هذه القطعة ${left} فقط`, {
          orderItemId: itemId,
          left,
        });
      }
      amount += Number(line.unit_price) * qty;
    }
    if (amount <= 0) throw badRequest('nothing_returned', 'اختر القطع المرتجعة');

    const restock = input.restock ?? input.reason !== 'defective';
    const created = await db.query(
      `INSERT INTO order_returns (order_id, store_id, reason, note, restocked, amount, commission_bps, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [orderId, order.store_id, input.reason, input.note?.trim() || null, restock, amount, order.commission_bps, staff.userId, ctx.now],
    );
    const returnId = created.rows[0].id as string;
    for (const [itemId, qty] of merged) {
      const line = byId.get(itemId)!;
      await db.query(`INSERT INTO order_return_items (return_id, order_item_id, quantity, amount) VALUES ($1, $2, $3, $4)`, [
        returnId,
        itemId,
        qty,
        Number(line.unit_price) * qty,
      ]);
      // Back on the shelf (the variant may have been deleted since: nothing to restock then).
      if (restock && line.variant_id) {
        await db.query(`UPDATE product_variants SET stock_qty = stock_qty + $2 WHERE id = $1`, [line.variant_id, qty]);
      }
      if (line.variant_id) {
        await db.query(
          `UPDATE products SET sold_count = GREATEST(0, sold_count - $2)
            WHERE id = (SELECT product_id FROM product_variants WHERE id = $1)`,
          [line.variant_id, qty],
        );
      }
    }
    return returnId;
  });
  const list = await listOrderReturns(ctx.db, orderId);
  return list.find((r) => r.id === id)!;
}
