import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { IdParams } from '../../lib/validation.js';
import { DELIVERY_FAILURE_KEYS } from '../orders/delivery-failure.js';
import { notifyOrderStatus } from '../orders/notify.js';
import {
  deliverOrder,
  failDelivery,
  getDriverHome,
  getDriverOrder,
  listDriverOrders,
  loadDriver,
  pickUpOrder,
  setDriverStatus,
} from './driver.service.js';

/** Driver mode (`/v1/driver`). Every route answers only for an active driver. */
export async function driverRoutes(app: FastifyInstance) {
  app.get('/me', async (req) => {
    const ctx = app.ctx(req);
    return getDriverHome(ctx, await loadDriver(ctx));
  });

  app.patch('/me/status', async (req) => {
    const ctx = app.ctx(req);
    const { status } = z.object({ status: z.enum(['available', 'offline']) }).parse(req.body);
    return setDriverStatus(ctx, await loadDriver(ctx), status);
  });

  app.get('/orders', async (req) => {
    const ctx = app.ctx(req);
    return listDriverOrders(ctx, await loadDriver(ctx));
  });

  app.get('/orders/:id', async (req) => {
    const ctx = app.ctx(req);
    const { id } = IdParams.parse(req.params);
    return getDriverOrder(ctx, await loadDriver(ctx), id);
  });

  app.post('/orders/:id/picked-up', async (req) => {
    const ctx = app.ctx(req);
    const { id } = IdParams.parse(req.params);
    const order = await pickUpOrder(ctx, await loadDriver(ctx), id);
    notifyOrderStatus(app, id);
    return order;
  });

  /** «تعذّر التسليم»: reason required (list), note optional → cancelled, items back to stock. */
  app.post('/orders/:id/failed', async (req) => {
    const ctx = app.ctx(req);
    const { id } = IdParams.parse(req.params);
    const body = z
      .object({ reason: z.enum(DELIVERY_FAILURE_KEYS), note: z.string().trim().max(200).optional() })
      .parse(req.body);
    const order = await failDelivery(ctx, await loadDriver(ctx), id, body.reason, body.note);
    notifyOrderStatus(app, id);
    return order;
  });

  app.post('/orders/:id/delivered', async (req) => {
    const ctx = app.ctx(req);
    const { id } = IdParams.parse(req.params);
    const order = await deliverOrder(ctx, await loadDriver(ctx), id);
    notifyOrderStatus(app, id);
    return order;
  });
}
