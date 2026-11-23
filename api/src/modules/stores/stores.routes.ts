import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getStore, listStores } from './stores.service.js';

export async function storesRoutes(app: FastifyInstance) {
  app.get('/stores', async (req) => {
    const q = z
      .object({
        featured: z.enum(['true', 'false']).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query);
    return { items: await listStores(app.ctx(req), { featured: q.featured === 'true', limit: q.limit }) };
  });

  app.get('/stores/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string().min(1).max(80) }).parse(req.params);
    return getStore(app.ctx(req), slug);
  });
}
