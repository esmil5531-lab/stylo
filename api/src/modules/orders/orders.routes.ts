import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { Id, IdParams, Pagination } from '../../lib/validation.js';
import { DELIVERY_MODES } from '../delivery/delivery.js';
import { notifyOrderStatus } from './notify.js';
import { cancelOwnOrder, checkout, getOrder, listNotifications, listOrders } from './orders.service.js';

export async function ordersRoutes(app: FastifyInstance) {
  app.post('/checkout', async (req, reply) => {
    const body = z
      .object({
        deliveryMode: z.enum(DELIVERY_MODES),
        addressId: Id.optional(),
        expectedTotal: z.number().int().nonnegative().optional(),
      })
      .parse(req.body);
    const result = await checkout(app.db, app.ctx(req), body);
    notifyOrderStatus(app, result.id);
    reply.status(201);
    return result;
  });

  app.get('/orders', async (req) => {
    const q = Pagination.parse(req.query);
    return { items: await listOrders(app.ctx(req), q) };
  });

  app.get('/me/notifications', async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(30) }).parse(req.query);
    return listNotifications(app.ctx(req), limit);
  });

  /** Cancel own order while «قيد الانتظار». */
  app.post('/orders/:id/cancel', async (req) => {
    const { id } = IdParams.parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().max(200).optional() }).parse(req.body ?? {});
    const order = await cancelOwnOrder(app.ctx(req), id, reason);
    notifyOrderStatus(app, id);
    return order;
  });

  app.get('/orders/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    return getOrder(app.ctx(req), id);
  });
}
