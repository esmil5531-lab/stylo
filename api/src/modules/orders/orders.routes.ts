import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { Id, IdParams, Pagination } from '../../lib/validation.js';
import { DELIVERY_MODES } from '../delivery/delivery.js';
import { notifyOrderStatus } from './notify.js';
import { checkout, getOrder, listOrders } from './orders.service.js';

export async function ordersRoutes(app: FastifyInstance) {
  app.post('/checkout', async (req, reply) => {
    const body = z
      .object({ deliveryMode: z.enum(DELIVERY_MODES), addressId: Id.optional() })
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

  app.get('/orders/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    return getOrder(app.ctx(req), id);
  });
}
