import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import type { Config } from './config.js';
import type { Pool } from './db.js';
import type { Ctx } from './lib/context.js';
import { AppError } from './lib/errors.js';
import { cartRoutes } from './modules/cart/cart.routes.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { homeRoutes } from './modules/home/home.routes.js';
import { looksRoutes } from './modules/looks/looks.routes.js';
import { ordersRoutes } from './modules/orders/orders.routes.js';
import { storesRoutes } from './modules/stores/stores.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { wishlistRoutes } from './modules/wishlist/wishlist.routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
    config: Config;
    ctx(req: FastifyRequest): Ctx;
  }
  interface FastifyRequest {
    userId: string | null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BuildAppOptions {
  pool: Pool;
  config: Config;
  /** Injectable clock for tests. */
  now?: () => Date;
  logger?: boolean;
}

export async function buildApp({ pool, config, now = () => new Date(), logger = true }: BuildAppOptions) {
  const app: FastifyInstance = Fastify({
    logger: logger ? { level: config.logLevel } : false,
  });

  app.decorate('db', pool);
  app.decorate('config', config);
  app.decorate('ctx', (req: FastifyRequest): Ctx => ({ db: pool, config, userId: req.userId, now: now() }));
  app.decorateRequest('userId', null);

  await app.register(cors, { origin: true });

  /**
   * TEMPORARY auth until real login exists (see CLAUDE.md):
   * outside production, `x-user-id` (or DEV_USER_ID) identifies the user.
   * In production no user is set, so every user route answers 401.
   */
  app.addHook('onRequest', async (req) => {
    if (config.env === 'production') return;
    const header = req.headers['x-user-id'];
    if (typeof header === 'string' && UUID_RE.test(header)) req.userId = header;
    else req.userId = config.devUserId ?? null;
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: 'بيانات غير صالحة', details: err.issues },
      });
    }
    // Postgres: invalid uuid text / foreign key violations from bad client input.
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '22P02') {
      return reply.status(400).send({ error: { code: 'invalid_id', message: 'معرّف غير صالح' } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: 'bad_request', message: (err as Error).message } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'حدث خطأ غير متوقع، حاولي مرة أخرى' } });
  });

  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { ok: true };
  });

  await app.register(
    async (v1) => {
      await v1.register(homeRoutes);
      await v1.register(catalogRoutes);
      await v1.register(storesRoutes);
      await v1.register(looksRoutes);
      await v1.register(cartRoutes);
      await v1.register(ordersRoutes);
      await v1.register(wishlistRoutes);
      await v1.register(usersRoutes);
    },
    { prefix: '/v1' },
  );

  return app;
}
