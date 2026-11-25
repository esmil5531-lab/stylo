import type { Queryable } from '../../db.js';

/**
 * A cancelled order puts its items back on the shelf and out of the «الأكثر مبيعاً» counters.
 * Used by every cancellation path: back office, the customer (pending order) and a failed delivery.
 */
export async function restockOrder(db: Queryable, orderId: string): Promise<void> {
  await db.query(
    `UPDATE product_variants v SET stock_qty = v.stock_qty + oi.quantity
       FROM order_items oi WHERE oi.order_id = $1 AND oi.variant_id = v.id`,
    [orderId],
  );
  await db.query(
    `UPDATE products p SET sold_count = GREATEST(0, p.sold_count - x.qty)
       FROM (SELECT v.product_id, SUM(oi.quantity) AS qty FROM order_items oi
               JOIN product_variants v ON v.id = oi.variant_id WHERE oi.order_id = $1 GROUP BY 1) x
      WHERE p.id = x.product_id`,
    [orderId],
  );
}
