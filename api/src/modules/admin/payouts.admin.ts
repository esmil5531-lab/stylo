import { inTransaction, type Queryable } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import type { StaffContext } from './permissions.js';

/**
 * Store payouts (تسوية مستحقات المتاجر).
 * - Only **delivered** orders are settled (open orders may still be cancelled).
 * - The period is by delivery day (Libya calendar), i.e. when the order became `delivered`.
 * - Each order is settled once (`payout_orders.order_id` is UNIQUE).
 * - payout = Σ subtotal − Σ commission (commission snapshot per order). Delivery fees are Stylo's.
 * Lifecycle: pending (calculated, not yet transferred) → paid (transfer reference recorded).
 * A pending payout can be cancelled, which releases its orders for a new settlement.
 */

const TZ = 'Africa/Tripoli';

/** Delivered orders not yet in any payout, with their delivery time. */
const UNSETTLED = `
  SELECT o.id, o.order_number, o.store_id, o.subtotal, o.commission_amount, o.commission_bps,
         d.delivered_at, (d.delivered_at AT TIME ZONE '${TZ}')::date AS delivered_day
    FROM orders o
    JOIN LATERAL (
      SELECT max(h.changed_at) AS delivered_at FROM order_status_history h
       WHERE h.order_id = o.id AND h.to_status = 'delivered'
    ) d ON true
   WHERE o.status = 'delivered'
     AND NOT EXISTS (SELECT 1 FROM payout_orders po WHERE po.order_id = o.id)`;

function scopeStore(staff: StaffContext, requested?: string): string | null {
  if (staff.storeId) {
    if (requested && requested !== staff.storeId) throw forbidden('يمكنك رؤية مستحقات متجرك فقط');
    return staff.storeId;
  }
  return requested ?? null;
}

/** What each store is owed right now (delivered, not yet settled). */
export async function listBalances(ctx: Ctx, staff: StaffContext) {
  const storeId = scopeStore(staff);
  const { rows } = await ctx.db.query(
    `SELECT s.id, s.name_ar, s.commission_bps,
            count(u.id)::int AS orders,
            COALESCE(SUM(u.subtotal), 0)::bigint AS sales,
            COALESCE(SUM(u.commission_amount), 0)::bigint AS commission,
            min(u.delivered_day)::text AS first_day, max(u.delivered_day)::text AS last_day,
            (SELECT max(p.period_to)::text FROM payouts p WHERE p.store_id = s.id) AS last_settled_to,
            (SELECT COALESCE(SUM(p.payout_amount), 0)::bigint FROM payouts p
              WHERE p.store_id = s.id AND p.status = 'pending') AS pending_amount
       FROM stores s
       LEFT JOIN (${UNSETTLED}) u ON u.store_id = s.id
      WHERE ($1::uuid IS NULL OR s.id = $1::uuid)
      GROUP BY s.id
      ORDER BY (COALESCE(SUM(u.subtotal), 0) - COALESCE(SUM(u.commission_amount), 0)) DESC, s.name_ar`,
    [storeId],
  );
  return rows.map((r) => ({
    storeId: r.id as string,
    storeName: r.name_ar as string,
    commissionBps: r.commission_bps as number,
    unsettled: {
      orders: r.orders as number,
      sales: r.sales as number,
      commission: r.commission as number,
      payout: (r.sales - r.commission) as number,
      firstDay: r.first_day as string | null,
      lastDay: r.last_day as string | null,
    },
    lastSettledTo: r.last_settled_to as string | null,
    pendingAmount: r.pending_amount as number,
  }));
}

async function candidates(db: Queryable, storeId: string, from: string, to: string, lock = false) {
  const { rows } = await db.query(
    `SELECT * FROM (${UNSETTLED}) u
      WHERE u.store_id = $1 AND u.delivered_day BETWEEN $2::date AND $3::date
      ORDER BY u.delivered_at`,
    [storeId, from, to],
  );
  if (lock && rows.length) {
    // Lock the orders so two settlements can't take the same ones.
    await db.query(`SELECT id FROM orders WHERE id = ANY($1::uuid[]) FOR UPDATE`, [rows.map((r) => r.id)]);
  }
  return rows;
}

function checkPeriod(from: string, to: string) {
  if (from > to) throw badRequest('invalid_range', 'تاريخ البداية بعد تاريخ النهاية');
}

export async function previewPayout(ctx: Ctx, staff: StaffContext, q: { storeId: string; from: string; to: string }) {
  checkPeriod(q.from, q.to);
  const storeId = scopeStore(staff, q.storeId)!;
  const rows = await candidates(ctx.db, storeId, q.from, q.to);
  const sales = rows.reduce((s, r) => s + Number(r.subtotal), 0);
  const commission = rows.reduce((s, r) => s + Number(r.commission_amount), 0);
  return {
    storeId,
    from: q.from,
    to: q.to,
    ordersCount: rows.length,
    sales,
    commission,
    payout: sales - commission,
    orders: rows.map((r) => ({
      id: r.id as string,
      orderNumber: r.order_number as number,
      deliveredAt: (r.delivered_at as Date).toISOString(),
      subtotal: r.subtotal as number,
      commissionBps: r.commission_bps as number,
      commission: r.commission_amount as number,
      payout: (r.subtotal - r.commission_amount) as number,
    })),
  };
}

export async function createPayout(
  ctx: Ctx,
  staff: StaffContext,
  input: { storeId: string; from: string; to: string; note?: string },
) {
  checkPeriod(input.from, input.to);
  const id = await inTransaction(ctx.db, async (db) => {
    const rows = await candidates(db, input.storeId, input.from, input.to, true);
    if (rows.length === 0) throw badRequest('nothing_to_settle', 'لا توجد طلبات مسلّمة غير مسوّاة في هذه الفترة');
    const sales = rows.reduce((s, r) => s + Number(r.subtotal), 0);
    const commission = rows.reduce((s, r) => s + Number(r.commission_amount), 0);
    const { rows: created } = await db.query(
      `INSERT INTO payouts (store_id, period_from, period_to, orders_count, sales, commission, note, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [input.storeId, input.from, input.to, rows.length, sales, commission, input.note?.trim() || null, staff.userId, ctx.now],
    );
    const payoutId = created[0].id as string;
    await db.query(
      `INSERT INTO payout_orders (payout_id, order_id) SELECT $1, unnest($2::uuid[])`,
      [payoutId, rows.map((r) => r.id)],
    );
    return payoutId;
  });
  return getPayout(ctx, staff, id);
}

const PAYOUT_SELECT = `
  SELECT p.*, s.name_ar AS store_name, cb.full_name AS created_by_name, pb.full_name AS paid_by_name
    FROM payouts p
    JOIN stores s ON s.id = p.store_id
    LEFT JOIN users cb ON cb.id = p.created_by
    LEFT JOIN users pb ON pb.id = p.paid_by`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPayout(r: any) {
  const day = (d: Date | string) => (typeof d === 'string' ? d : new Intl.DateTimeFormat('en-CA').format(d));
  return {
    id: r.id as string,
    number: r.number as number,
    store: { id: r.store_id as string, name: r.store_name as string },
    from: day(r.period_from),
    to: day(r.period_to),
    currency: r.currency as string,
    ordersCount: r.orders_count as number,
    sales: r.sales as number,
    commission: r.commission as number,
    payoutAmount: r.payout_amount as number,
    status: r.status as 'pending' | 'paid',
    note: r.note as string | null,
    reference: r.reference as string | null,
    createdAt: (r.created_at as Date).toISOString(),
    createdBy: r.created_by_name as string | null,
    paidAt: r.paid_at ? (r.paid_at as Date).toISOString() : null,
    paidBy: r.paid_by_name as string | null,
  };
}

export async function listPayouts(ctx: Ctx, staff: StaffContext, q: { storeId?: string; status?: 'pending' | 'paid' }) {
  const storeId = scopeStore(staff, q.storeId);
  const { rows } = await ctx.db.query(
    `${PAYOUT_SELECT}
      WHERE ($1::uuid IS NULL OR p.store_id = $1::uuid) AND ($2::payout_status IS NULL OR p.status = $2::payout_status)
      ORDER BY p.created_at DESC LIMIT 200`,
    [storeId, q.status ?? null],
  );
  return rows.map(mapPayout);
}

export async function getPayout(ctx: Ctx, staff: StaffContext, id: string) {
  const { rows } = await ctx.db.query(`${PAYOUT_SELECT} WHERE p.id = $1`, [id]);
  const r = rows[0];
  if (!r || (staff.storeId && r.store_id !== staff.storeId)) throw notFound('التسوية');
  const orders = await ctx.db.query(
    `SELECT o.id, o.order_number, o.subtotal, o.commission_bps, o.commission_amount, o.placed_at
       FROM payout_orders po JOIN orders o ON o.id = po.order_id
      WHERE po.payout_id = $1 ORDER BY o.order_number`,
    [id],
  );
  return {
    ...mapPayout(r),
    orders: orders.rows.map((o) => ({
      id: o.id as string,
      orderNumber: o.order_number as number,
      placedAt: (o.placed_at as Date).toISOString(),
      subtotal: o.subtotal as number,
      commissionBps: o.commission_bps as number,
      commission: o.commission_amount as number,
      payout: (o.subtotal - o.commission_amount) as number,
    })),
  };
}

export async function markPayoutPaid(
  ctx: Ctx,
  staff: StaffContext,
  id: string,
  input: { reference: string; note?: string },
) {
  const { rowCount } = await ctx.db.query(
    `UPDATE payouts SET status = 'paid', paid_at = $2, paid_by = $3, reference = $4,
            note = COALESCE($5, note)
      WHERE id = $1 AND status = 'pending'`,
    [id, ctx.now, staff.userId, input.reference.trim(), input.note?.trim() || null],
  );
  if (!rowCount) {
    const exists = await ctx.db.query(`SELECT status FROM payouts WHERE id = $1`, [id]);
    if (!exists.rows[0]) throw notFound('التسوية');
    throw conflict('already_paid', 'هذه التسوية مدفوعة مسبقاً');
  }
  return getPayout(ctx, staff, id);
}

/** Cancel a pending payout: its orders become unsettled again. Paid payouts are permanent. */
export async function cancelPayout(ctx: Ctx, id: string) {
  const { rows } = await ctx.db.query(`DELETE FROM payouts WHERE id = $1 AND status = 'pending' RETURNING id`, [id]);
  if (!rows[0]) {
    const exists = await ctx.db.query(`SELECT status FROM payouts WHERE id = $1`, [id]);
    if (!exists.rows[0]) throw notFound('التسوية');
    throw conflict('already_paid', 'لا يمكن إلغاء تسوية مدفوعة');
  }
  return { id, cancelled: true };
}
