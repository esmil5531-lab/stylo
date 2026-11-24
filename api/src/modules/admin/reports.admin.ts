import type { Ctx } from '../../lib/context.js';
import { badRequest } from '../../lib/errors.js';
import type { StaffContext } from './permissions.js';

/**
 * Sales, orders and commission reports (LYD dirhams), by Libya calendar day.
 *
 * Definitions (documented in CLAUDE.md so numbers mean the same thing everywhere):
 *  - Sales (المبيعات) = merchandise subtotal of non-cancelled orders. Delivery fees are reported apart.
 *  - Commission (عمولة ستايلو) = Σ orders.commission_amount: subtotal × the store's rate *at checkout*.
 *  - Store payout (مستحقات المتاجر) = sales − commission.
 *  - Stylo revenue (إيراد ستايلو) = commission + delivery fees (Stylo runs the drivers).
 *  - "Realised" figures count delivered orders only; open orders can still be cancelled.
 */

const TZ = 'Africa/Tripoli';
const MAX_DAYS = 366;

export interface ReportQuery {
  from?: string;
  to?: string;
  storeId?: string;
}

function libyaToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now); // YYYY-MM-DD
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function resolveRange(q: ReportQuery, now: Date): { from: string; to: string; days: number } {
  const to = q.to ?? libyaToday(now);
  const from = q.from ?? addDays(to, -29);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days < 1) throw badRequest('invalid_range', 'تاريخ البداية بعد تاريخ النهاية');
  if (days > MAX_DAYS) throw badRequest('invalid_range', 'أقصى مدة للتقرير سنة واحدة');
  return { from, to, days };
}

export async function getReport(ctx: Ctx, staff: StaffContext, q: ReportQuery) {
  const range = resolveRange(q, ctx.now);
  const storeId = staff.storeId ?? q.storeId ?? null;

  // $1 from, $2 to, $3 store (nullable)
  const params = [range.from, range.to, storeId];
  const scope = `(o.placed_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
                 AND ($3::uuid IS NULL OR o.store_id = $3::uuid)`;

  const [summary, daily, byStore, topProducts, byStatus] = await Promise.all([
    ctx.db.query(
      `SELECT count(*)::int AS orders,
              count(*) FILTER (WHERE o.status = 'delivered')::int AS delivered,
              count(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled,
              count(*) FILTER (WHERE o.status NOT IN ('delivered', 'cancelled'))::int AS open,
              COALESCE(SUM(o.subtotal) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS sales,
              COALESCE(SUM(o.commission_amount) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS commission,
              COALESCE(SUM(o.shipping_fee) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS delivery_fees,
              COALESCE(SUM(o.subtotal) FILTER (WHERE o.status = 'delivered'), 0)::bigint AS realised_sales,
              COALESCE(SUM(o.commission_amount) FILTER (WHERE o.status = 'delivered'), 0)::bigint AS realised_commission,
              COALESCE(SUM(o.subtotal) FILTER (WHERE o.status = 'cancelled'), 0)::bigint AS cancelled_sales
         FROM orders o WHERE ${scope}`,
      params,
    ),
    ctx.db.query(
      `SELECT d::date::text AS day,
              count(o.id) FILTER (WHERE o.status <> 'cancelled')::int AS orders,
              COALESCE(SUM(o.subtotal) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS sales,
              COALESCE(SUM(o.commission_amount) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS commission
         FROM generate_series($1::date, $2::date, interval '1 day') d
         LEFT JOIN orders o ON (o.placed_at AT TIME ZONE '${TZ}')::date = d::date
                           AND ($3::uuid IS NULL OR o.store_id = $3::uuid)
        GROUP BY d ORDER BY d`,
      params,
    ),
    ctx.db.query(
      `SELECT s.id, s.name_ar, s.commission_bps AS current_bps,
              count(o.id)::int AS orders,
              count(o.id) FILTER (WHERE o.status = 'cancelled')::int AS cancelled,
              COALESCE(SUM(o.subtotal) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS sales,
              COALESCE(SUM(o.commission_amount) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS commission,
              COALESCE(SUM(o.shipping_fee) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS delivery_fees
         FROM stores s
         LEFT JOIN orders o ON o.store_id = s.id
                           AND (o.placed_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
        WHERE ($3::uuid IS NULL OR s.id = $3::uuid)
        GROUP BY s.id ORDER BY sales DESC, s.name_ar`,
      params,
    ),
    ctx.db.query(
      `SELECT oi.product_name_ar AS name, s.name_ar AS store_name,
              SUM(oi.quantity)::int AS quantity, SUM(oi.line_total)::bigint AS sales
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
         JOIN stores s ON s.id = o.store_id
        WHERE ${scope}
        GROUP BY oi.product_name_ar, s.name_ar
        ORDER BY sales DESC LIMIT 8`,
      params,
    ),
    ctx.db.query(`SELECT o.status, count(*)::int AS n FROM orders o WHERE ${scope} GROUP BY 1`, params),
  ]);

  const s = summary.rows[0];
  const nonCancelled = s.orders - s.cancelled;
  return {
    range,
    scope: storeId ? { storeId } : null,
    currency: 'LYD',
    summary: {
      orders: s.orders as number,
      delivered: s.delivered as number,
      cancelled: s.cancelled as number,
      open: s.open as number,
      sales: s.sales as number,
      commission: s.commission as number,
      deliveryFees: s.delivery_fees as number,
      storePayout: (s.sales - s.commission) as number,
      styloRevenue: (s.commission + s.delivery_fees) as number,
      realisedSales: s.realised_sales as number,
      realisedCommission: s.realised_commission as number,
      cancelledSales: s.cancelled_sales as number,
      averageOrderValue: nonCancelled > 0 ? Math.round(s.sales / nonCancelled) : 0,
      /** Basis points actually earned on sales (mix of store rates). */
      effectiveCommissionBps: s.sales > 0 ? Math.round((s.commission / s.sales) * 10_000) : 0,
      cancellationRateBps: s.orders > 0 ? Math.round((s.cancelled / s.orders) * 10_000) : 0,
    },
    ordersByStatus: Object.fromEntries(byStatus.rows.map((r) => [r.status, r.n])),
    daily: daily.rows.map((r) => ({
      day: r.day as string,
      orders: r.orders as number,
      sales: r.sales as number,
      commission: r.commission as number,
    })),
    byStore: byStore.rows.map((r) => ({
      storeId: r.id as string,
      storeName: r.name_ar as string,
      currentCommissionBps: r.current_bps as number,
      orders: r.orders as number,
      cancelled: r.cancelled as number,
      sales: r.sales as number,
      commission: r.commission as number,
      deliveryFees: r.delivery_fees as number,
      payout: (r.sales - r.commission) as number,
    })),
    topProducts: topProducts.rows.map((r) => ({
      name: r.name as string,
      storeName: r.store_name as string,
      quantity: r.quantity as number,
      sales: r.sales as number,
    })),
  };
}
