import { randomUUID } from 'node:crypto';

import { withTransaction, type Pool } from '../../db.js';
import { requireUser, type Ctx } from '../../lib/context.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { buildCartView, loadLines } from '../cart/cart.service.js';
import type { DeliveryMode } from '../delivery/delivery.js';

export interface CheckoutInput {
  deliveryMode: DeliveryMode;
  addressId?: string;
}

/**
 * Turns the (single-store) cart into ONE order, atomically: locks the variants, re-checks stock,
 * snapshots the lines, decrements stock, updates sales counters and empties the cart.
 */
export async function checkout(pool: Pool, baseCtx: Ctx, input: CheckoutInput) {
  const userId = requireUser(baseCtx);

  return withTransaction(pool, async (client) => {
    const ctx: Ctx = { ...baseCtx, db: client };

    const addr = await client.query(
      `SELECT id, label, recipient_name, phone, country_code, city, district, street, building, landmark, postal_code
         FROM addresses WHERE user_id = $1 AND ($2::uuid IS NULL OR id = $2::uuid)
        ORDER BY is_default DESC, updated_at DESC LIMIT 1`,
      [userId, input.addressId ?? null],
    );
    const address = addr.rows[0];
    if (!address && input.addressId) throw notFound('العنوان');
    if (!address) throw badRequest('address_required', 'أضيفي عنوان توصيل لإتمام الطلب');

    const rows = await loadLines(client, { kind: 'cart', userId }, true);
    const cart = buildCartView(rows, address.city, ctx);
    if (!cart.store || !cart.delivery) throw badRequest('cart_empty', 'السلة فارغة');
    if (cart.hasIssues) {
      const problems = cart.items
        .filter((i) => i.issue)
        .map((i) => ({ variantId: i.variantId, issue: i.issue, available: i.stock }));
      throw conflict('cart_has_issues', 'بعض المنتجات لم تعد متوفرة بالكمية المطلوبة', problems);
    }

    const option = cart.delivery[input.deliveryMode];
    const { rows: created } = await client.query(
      `INSERT INTO orders (checkout_id, customer_id, store_id, currency, subtotal, shipping_fee,
                           shipping_address, delivery_mode, estimated_delivery_at, commission_bps)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               (SELECT commission_bps FROM stores WHERE id = $3)) -- rate snapshot for reports
       RETURNING id, order_number, total, estimated_delivery_at`,
      [
        randomUUID(),
        userId,
        cart.store.id,
        cart.currency,
        cart.subtotal,
        option.fee,
        address,
        input.deliveryMode,
        option.arrivesAt,
      ],
    );
    const order = created[0];

    for (const item of cart.items) {
      await client.query(
        `INSERT INTO order_items (order_id, variant_id, product_name_ar, sku, size, color_name_ar, unit_price, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [order.id, item.variantId, item.name, item.sku, item.size, item.colorName, item.unitPrice, item.quantity],
      );
      await client.query(`UPDATE product_variants SET stock_qty = stock_qty - $2 WHERE id = $1`, [
        item.variantId,
        item.quantity,
      ]);
      await client.query(`UPDATE products SET sold_count = sold_count + $2 WHERE id = $1`, [
        item.productId,
        item.quantity,
      ]);
    }

    await client.query(`DELETE FROM carts WHERE user_id = $1`, [userId]);

    return {
      id: order.id as string,
      orderNumber: order.order_number as number,
      store: cart.store,
      deliveryMode: input.deliveryMode,
      currency: cart.currency,
      subtotal: cart.subtotal,
      deliveryFee: option.fee,
      total: order.total as number,
      estimatedDeliveryAt: (order.estimated_delivery_at as Date).toISOString(),
    };
  });
}

const ORDER_LIST_SELECT = `
  SELECT o.id, o.order_number, o.checkout_id, o.status, o.payment_status, o.currency, o.subtotal,
         o.shipping_fee, o.discount, o.total, o.delivery_mode, o.estimated_delivery_at, o.placed_at,
         o.tracking_number, o.cancel_reason, o.shipping_address,
         s.id AS store_id, s.slug AS store_slug, s.name_ar AS store_name, s.logo_text, s.brand_color,
         (SELECT COALESCE(SUM(quantity), 0)::int FROM order_items oi WHERE oi.order_id = o.id) AS items_count
    FROM orders o JOIN stores s ON s.id = o.store_id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrder(r: any) {
  return {
    id: r.id as string,
    orderNumber: r.order_number as number,
    checkoutId: r.checkout_id as string,
    status: r.status as string,
    paymentStatus: r.payment_status as string,
    currency: r.currency as string,
    subtotal: r.subtotal as number,
    shippingFee: r.shipping_fee as number,
    discount: r.discount as number,
    total: r.total as number,
    /** 'unified' only on orders placed before single-store carts (migration 0003). */
    deliveryMode: r.delivery_mode as DeliveryMode | 'unified',
    estimatedDeliveryAt: r.estimated_delivery_at ? (r.estimated_delivery_at as Date).toISOString() : null,
    placedAt: (r.placed_at as Date).toISOString(),
    trackingNumber: r.tracking_number as string | null,
    cancelReason: r.cancel_reason as string | null,
    itemsCount: r.items_count as number,
    store: {
      id: r.store_id as string,
      slug: r.store_slug as string,
      name: r.store_name as string,
      logoText: (r.logo_text ?? r.store_name) as string,
      brandColor: r.brand_color as string | null,
    },
  };
}

export async function listOrders(ctx: Ctx, opts: { limit: number; offset: number }) {
  const userId = requireUser(ctx);
  const { rows } = await ctx.db.query(
    `${ORDER_LIST_SELECT} WHERE o.customer_id = $1 ORDER BY o.placed_at DESC, o.order_number DESC LIMIT $2 OFFSET $3`,
    [userId, opts.limit, opts.offset],
  );
  return rows.map(mapOrder);
}

export async function getOrder(ctx: Ctx, id: string) {
  const userId = requireUser(ctx);
  const { rows } = await ctx.db.query(`${ORDER_LIST_SELECT} WHERE o.id = $1 AND o.customer_id = $2`, [id, userId]);
  if (!rows[0]) throw notFound('الطلب');

  const [items, history] = await Promise.all([
    ctx.db.query(
      `SELECT oi.id, oi.variant_id, oi.product_name_ar, oi.sku, oi.size, oi.color_name_ar, oi.unit_price,
              oi.quantity, oi.line_total, v.product_id, v.color_hex
         FROM order_items oi LEFT JOIN product_variants v ON v.id = oi.variant_id
        WHERE oi.order_id = $1 ORDER BY oi.product_name_ar`,
      [id],
    ),
    ctx.db.query(
      `SELECT from_status, to_status, note, changed_at FROM order_status_history WHERE order_id = $1 ORDER BY id`,
      [id],
    ),
  ]);

  return {
    ...mapOrder(rows[0]),
    shippingAddress: rows[0].shipping_address,
    items: items.rows.map((r) => ({
      id: r.id as string,
      productId: r.product_id as string | null,
      name: r.product_name_ar as string,
      sku: r.sku as string,
      size: r.size as string | null,
      colorName: r.color_name_ar as string | null,
      colorHex: r.color_hex as string | null,
      unitPrice: r.unit_price as number,
      quantity: r.quantity as number,
      lineTotal: r.line_total as number,
    })),
    history: history.rows.map((r) => ({
      from: r.from_status as string | null,
      to: r.to_status as string,
      note: r.note as string | null,
      at: (r.changed_at as Date).toISOString(),
    })),
  };
}

/**
 * «الإشعارات»: the latest status changes of the customer's own orders (newest first), from
 * order_status_history — the same log the order page shows. Read state is kept on the device.
 */
export async function listNotifications(ctx: Ctx, limit = 30) {
  const userId = requireUser(ctx);
  const { rows } = await ctx.db.query(
    `SELECT h.id, h.to_status, h.note, h.changed_at, o.id AS order_id, o.order_number, s.name_ar AS store_name
       FROM order_status_history h
       JOIN orders o ON o.id = h.order_id
       JOIN stores s ON s.id = o.store_id
      WHERE o.customer_id = $1
      ORDER BY h.changed_at DESC, h.id DESC
      LIMIT $2`,
    [userId, limit],
  );
  return {
    items: rows.map((r) => ({
      id: String(r.id),
      orderId: r.order_id as string,
      orderNumber: Number(r.order_number),
      storeName: r.store_name as string,
      status: r.to_status as string,
      // Only the cancellation reason is meant for the customer; other notes are operational.
      note: r.to_status === 'cancelled' ? ((r.note as string | null) ?? null) : null,
      at: (r.changed_at as Date).toISOString(),
    })),
  };
}
