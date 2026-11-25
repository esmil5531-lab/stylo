import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { IdParams, Pagination } from '../../lib/validation.js';
import {
  completeTheLook,
  FEEDS,
  getProduct,
  listCategories,
  listProducts,
  productFacets,
  SORTS,
} from './catalog.service.js';

const FilterQuery = z.object({
  feed: z.enum(FEEDS).optional(),
  category: z.string().max(60).optional(),
  store: z.string().max(80).optional(),
  q: z.string().trim().min(1).max(80).optional(),
});

/** Dirhams in the query string (?minPrice=100000). */
const Dirhams = z.coerce.number().int().min(0).max(1_000_000_000);

const ListQuery = Pagination.merge(FilterQuery).extend({
  sort: z.enum(SORTS).optional(),
  /** Comma-separated sizes with stock: ?sizes=M,L or ?sizes=38 */
  sizes: z
    .string()
    .max(200)
    .optional()
    .transform((v) => (v ? [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 15) : undefined)),
  minPrice: Dirhams.optional(),
  maxPrice: Dirhams.optional(),
});

export async function catalogRoutes(app: FastifyInstance) {
  /** { items, total, hasMore } — feed / category / store / search, «ترتيب», size and price filters. */
  app.get('/products', async (req) => listProducts(app.ctx(req), ListQuery.parse(req.query)));

  /** Sizes in stock and price range of the same listing (for the filter sheet). */
  app.get('/products/facets', async (req) => productFacets(app.ctx(req), FilterQuery.parse(req.query)));

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
