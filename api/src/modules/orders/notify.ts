import type { FastifyInstance } from 'fastify';

import { STATUS_AR, type OrderStatus } from '../admin/orders.admin.js';

/**
 * Tell the customer (WhatsApp) that their order changed status. Fire-and-forget: it runs after the
 * response and never fails the request; every attempt is recorded in message_log.
 */
export function notifyOrderStatus(app: FastifyInstance, orderId: string): void {
  if (!app.config.messaging.notifyOrderStatus) return;
  void (async () => {
    const { rows } = await app.db.query(
      `SELECT o.order_number, o.status, s.name_ar AS store_name, c.full_name,
              COALESCE(c.phone, o.shipping_address->>'phone') AS phone
         FROM orders o JOIN stores s ON s.id = o.store_id JOIN users c ON c.id = o.customer_id
        WHERE o.id = $1`,
      [orderId],
    );
    const r = rows[0];
    if (!r?.phone || !/^\+2189[1-5]\d{7}$/.test(r.phone)) return;
    await app.messenger.sendOrderStatus(
      r.phone,
      {
        customerName: String(r.full_name ?? '').split(' ')[0] || 'عميلتنا',
        orderNumber: Number(r.order_number),
        statusAr: STATUS_AR[r.status as OrderStatus],
        storeName: r.store_name,
      },
      orderId,
    );
  })().catch((err) => app.log.warn({ err, orderId }, 'order status notification failed'));
}
