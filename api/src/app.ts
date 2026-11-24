import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import type { Config } from './config.js';
import type { Pool } from './db.js';
import type { Ctx } from './lib/context.js';
import { diagnoseDbError } from './lib/database.js';
import { AppError } from './lib/errors.js';
import { createMessenger, type FetchLike, type Messenger } from './lib/messaging.js';
import { createStorage, type MediaStorage } from './lib/media.js';
import fastifyStatic from '@fastify/static';
import { mkdirSync } from 'node:fs';
import { robotsTxt, sitemapXml } from './seo.js';
import { registerWebsites } from './web.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { authRoutes, bearerToken } from './modules/auth/auth.routes.js';
import { resolveSession } from './modules/auth/auth.service.js';
import { driverRoutes } from './modules/driver/driver.routes.js';
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
    /** WhatsApp (or SMS / console) — OTP codes and order status updates. */
    messenger: Messenger;
    /** Where uploaded photos are stored (disk or Supabase Storage). */
    media: MediaStorage;
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
  /** Tests: replace the network call to WhatsApp / SMS. */
  fetch?: FetchLike;
  /** Tests: replace the network call to Supabase Storage. */
  mediaFetch?: FetchLike;
}

export async function buildApp({ pool, config, now = () => new Date(), logger = true, fetch, mediaFetch }: BuildAppOptions) {
  const app: FastifyInstance = Fastify({
    logger: logger ? { level: config.logLevel } : false,
    trustProxy: config.trustProxy,
  });

  app.decorate('db', pool);
  app.decorate('config', config);
  app.decorate('ctx', (req: FastifyRequest): Ctx => ({ db: pool, config, userId: req.userId, now: now() }));
  app.decorateRequest('userId', null);
  app.decorate('messenger', createMessenger(config.messaging, { db: pool, log: (m) => app.log.info(m), fetch }));
  app.decorate('media', createStorage(config.media, mediaFetch));

  // The websites call /v1 on the same origin and the native app sends no Origin, so production
  // needs no CORS at all unless CORS_ORIGINS lists another site.
  await app.register(cors, { origin: config.corsOrigins });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    const url = req.url;
    if (url.startsWith('/v1') || url.startsWith('/admin')) reply.header('x-robots-tag', 'noindex, nofollow');
    if (url.startsWith('/admin')) reply.header('x-frame-options', 'DENY');
    else reply.header('x-frame-options', 'SAMEORIGIN');
    return payload;
  });

  /**
   * Who is calling: `Authorization: Bearer <token>` from phone + code sign-in (/v1/auth).
   * Tests only (AUTH_DEV_HEADER, never in production): `x-user-id` / DEV_USER_ID.
   */
  app.addHook('onRequest', async (req) => {
    const token = bearerToken(req.headers.authorization);
    if (token) {
      req.userId = await resolveSession(pool, token, now());
      return;
    }
    if (config.auth.devHeader) {
      const header = req.headers['x-user-id'];
      if (typeof header === 'string' && UUID_RE.test(header)) req.userId = header;
      else req.userId = config.auth.devUserId ?? null;
    }
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
    if (pgCode === '23514' && (err as { constraint?: string }).constraint === 'cart_single_store') {
      return reply.status(409).send({
        error: { code: 'cart_store_conflict', message: 'السلة تقبل منتجات من متجر واحد فقط' },
      });
    }
    if (pgCode === '23505') {
      const constraint = (err as { constraint?: string }).constraint;
      const message =
        constraint === 'product_variants_sku_key'
          ? 'رمز SKU مستخدم لمنتج آخر'
          : constraint === 'categories_slug_key'
            ? 'الرابط المختصر (slug) مستخدم لقسم آخر'
          : constraint === 'product_variants_size_color_uniq'
            ? 'هذا المقاس بهذا اللون موجود مسبقاً في المنتج'
            : 'هذه البيانات مسجّلة من قبل';
      return reply.status(409).send({ error: { code: 'duplicate', message } });
    }
    if (pgCode === '23514' && (err as { constraint?: string }).constraint === 'categories_two_levels') {
      return reply.status(400).send({
        error: { code: 'invalid_parent', message: 'الأقسام مستويان فقط: قسم رئيسي وأقسام فرعية تحته' },
      });
    }
    if (pgCode === '23514' && (err as { constraint?: string }).constraint === 'look_single_store') {
      return reply.status(400).send({
        error: { code: 'look_single_store', message: 'كل قطع اللوك من نفس المتجر، حتى يُضاف كاملاً لسلة واحدة' },
      });
    }
    if (pgCode === '23514' && (err as { constraint?: string }).constraint === 'orders_shipped_needs_driver') {
      return reply.status(400).send({ error: { code: 'driver_required', message: 'أسندي الطلب لسائق أولاً' } });
    }
    if (pgCode === '22P02') {
      return reply.status(400).send({ error: { code: 'invalid_id', message: 'معرّف غير صالح' } });
    }
    // Cannot reach the database (wrong host, Supabase IPv6-only address, password, SSL…):
    // say so instead of «حدث خطأ غير متوقع», with the fix in development.
    const dbProblem = diagnoseDbError(err, config.database.url);
    if (dbProblem) {
      req.log.error({ err, dbProblem: dbProblem.code }, dbProblem.hint);
      const dev = config.env !== 'production';
      return reply.status(503).send({
        error: {
          code: 'database_unavailable',
          message: dev
            ? `تعذّر الاتصال بقاعدة البيانات. ${dbProblem.hintAr}`
            : 'الخدمة غير متاحة مؤقتاً، حاولي بعد قليل',
          details: dev ? { reason: dbProblem.code } : undefined,
        },
      });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: 'bad_request', message: (err as Error).message } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'حدث خطأ غير متوقع، حاولي مرة أخرى' } });
  });

  app.get('/health', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { ok: true, database: 'connected' };
    } catch (err) {
      const problem = diagnoseDbError(err, config.database.url);
      return reply.status(503).send({
        ok: false,
        database: problem?.code ?? 'error',
        ...(config.env !== 'production' && problem ? { hint: problem.hintAr } : {}),
      });
    }
  });

  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(homeRoutes);
      await v1.register(catalogRoutes);
      await v1.register(storesRoutes);
      await v1.register(looksRoutes);
      await v1.register(cartRoutes);
      await v1.register(ordersRoutes);
      await v1.register(wishlistRoutes);
      await v1.register(usersRoutes);
      await v1.register(adminRoutes, { prefix: '/admin' });
      await v1.register(driverRoutes, { prefix: '/driver' });
    },
    { prefix: '/v1' },
  );

  // Uploaded photos on this server's disk (MEDIA_STORAGE=local). File names are random and never
  // change, so they are cached for a year.
  if (config.media.driver === 'local') {
    mkdirSync(config.media.localDir, { recursive: true });
    await app.register(fastifyStatic, {
      root: config.media.localDir,
      prefix: '/uploads/',
      decorateReply: false,
      wildcard: true,
      index: false,
      cacheControl: false,
      allowedPath: (p) => p.endsWith('.webp'),
      setHeaders: (reply) => reply.header('cache-control', 'public, max-age=31536000, immutable'),
    });
  }

  // robots.txt + sitemap.xml for Google (see seo.ts).
  const origin = (req: FastifyRequest) => config.seo.siteUrl ?? `${req.protocol}://${req.host}`;
  app.get('/robots.txt', async (req, reply) => reply.type('text/plain; charset=utf-8').send(robotsTxt(origin(req), config.seo)));
  app.get('/sitemap.xml', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=3600');
    return reply.type('application/xml; charset=utf-8').send(await sitemapXml(pool, origin(req)));
  });

  // The customer site (/) and the back office (/admin) when built — see registerWebsites.
  await registerWebsites(app, config.web, { db: pool, seo: config.seo, origin }, { production: config.env === 'production' });

  return app;
}
