import { withTransaction, type Pool } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { restockOrder } from '../orders/restock.js';
import type { StaffContext } from './permissions.js';

/**
 * «تنبيهات الطلبات» for the back office (polled every ~20 s by every page of the panel):
 * - new orders waiting for the store to confirm (the panel beeps / notifies when the newest grows),
 * - late ones: still pending after `pendingAlertMinutes`,
 * - for Stylo staff who assign drivers: confirmed/processing orders with no driver yet.
 * Store staff only ever see their own store.
 */
export interface OrderAlerts {
  pending: { count: number; newestOrderNumber: number | null; newestAt: string | null };
  late: {
    count: number;
    minutes: number;
    items: { id: string; orderNumber: number; storeName: string; placedAt: string; waitingMinutes: number }[];
  };
  /** null when this staff member does not assign drivers. */
  unassigned: { count: number; oldestAt: string | null } | null;
  /** Minutes after which pending orders are cancelled automatically (0 = never). */
  autoCancelMinutes: number;
}

export async function getOrderAlerts(ctx: Ctx, staff: StaffContext): Promise<OrderAlerts> {
  const cfg = ctx.config.orderAlerts;
  const params: unknown[] = [ctx.now, cfg.pendingAlertMinutes];
  const storeScope = staff.storeId ? `AND o.store_id = $${params.push(staff.storeId)}` : '';
  const pending = await ctx.db.query(
    `SELECT count(*)::int AS n, max(o.order_number) AS newest, max(o.placed_at) AS newest_at,
            count(*) FILTER (WHERE o.placed_at <= $1::timestamptz - make_interval(mins => $2::int))::int AS late
       FROM orders o WHERE o.status = 'pending' ${storeScope}`,
    params,
  );
  const late = await ctx.db.query(
    `SELECT o.id, o.order_number, s.name_ar AS store_name, o.placed_at,
            floor(extract(epoch FROM ($1::timestamptz - o.placed_at)) / 60)::int AS waiting
       FROM orders o JOIN stores s ON s.id = o.store_id
      WHERE o.status = 'pending' AND o.placed_at <= $1::timestamptz - make_interval(mins => $2::int) ${storeScope}
      ORDER BY o.placed_at LIMIT 10`,
    params,
  );
  let unassigned: OrderAlerts['unassigned'] = null;
  if (!staff.storeId && staff.permissions.has('orders.assign_driver')) {
    const u = await ctx.db.query(
      `SELECT count(*)::int AS n, min(placed_at) AS oldest
         FROM orders WHERE status IN ('confirmed', 'processing') AND driver_id IS NULL`,
    );
    unassigned = { count: u.rows[0].n, oldestAt: u.rows[0].oldest ? (u.rows[0].oldest as Date).toISOString() : null };
  }
  const p = pending.rows[0];
  return {
    pending: {
      count: p.n,
      newestOrderNumber: p.newest === null ? null : Number(p.newest),
      newestAt: p.newest_at ? (p.newest_at as Date).toISOString() : null,
    },
    late: {
      count: p.late,
      minutes: cfg.pendingAlertMinutes,
      items: late.rows.map((r) => ({
        id: r.id as string,
        orderNumber: Number(r.order_number),
        storeName: r.store_name as string,
        placedAt: (r.placed_at as Date).toISOString(),
        waitingMinutes: r.waiting as number,
      })),
    },
    unassigned,
    autoCancelMinutes: cfg.autoCancelPendingMinutes,
  };
}

export const autoCancelNote = (minutes: number) => `أُلغي تلقائياً: لم يؤكد المتجر الطلب خلال ${minutes} دقيقة`;

/**
 * Optional (PENDING_AUTO_CANCEL_MINUTES > 0): cancels pending orders the store never confirmed,
 * puts the items back on the shelf and returns their ids (the caller tells each customer).
 * Each order is locked and re-checked, so a store confirming at the same moment wins.
 */
export async function autoCancelLatePending(pool: Pool, now: Date, minutes: number): Promise<string[]> {
  if (minutes <= 0) return [];
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM orders
      WHERE status = 'pending' AND placed_at <= $1::timestamptz - make_interval(mins => $2::int)
      ORDER BY placed_at LIMIT 50`,
    [now, minutes],
  );
  const cancelled: string[] = [];
  for (const { id } of rows) {
    const done = await withTransaction(pool, async (db) => {
      const lock = await db.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [id]);
      if (lock.rows[0]?.status !== 'pending') return false;
      const note = autoCancelNote(minutes);
      // No actor: the history shows a system change, with the reason as its note.
      await db.query(`SELECT set_config('stylo.actor_id', '', true), set_config('stylo.status_note', $1, true)`, [note]);
      await db.query(`UPDATE orders SET status = 'cancelled', cancel_reason = $2 WHERE id = $1`, [id, note]);
      await restockOrder(db, id);
      return true;
    });
    if (done) cancelled.push(id);
  }
  return cancelled;
}
