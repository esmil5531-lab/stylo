import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { IdParams, Pagination } from '../../lib/validation.js';
import { completeTheLook, FEEDS, getProduct, listCategories, listProducts } from './catalog.service.js';

const ListQuery = Pagination.extend({
  feed: z.enum(FEEDS).optional(),
  category: z.string().max(60).optional(),
  store: z.string().max(80).optional(),
  q: z.string().trim().min(1).max(80).optional(),
});

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/products', async (req) => {
    const q = ListQuery.parse(req.query);
    return { items: await listProducts(app.ctx(req), q) };
  });

  app.get('/products/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    return getProduct(app.ctx(req), id);
  });

  app.get('/products/:id/complete-the-look', async (req) => {
    const { id } = IdParams.parse(req.params);
    return { items: await completeTheLook(app.ctx(req), id) };
  });

  app.get('/categories', async (req) => ({ items: await listCategories(app.ctx(req)) }));
}
