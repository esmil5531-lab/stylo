import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { Id } from '../../lib/validation.js';
import { addLookToCart } from '../cart/cart.service.js';
import { getLook, listLooks } from './looks.service.js';

const LookParams = z.object({ id: z.string().min(1).max(80) });

export async function looksRoutes(app: FastifyInstance) {
  app.get('/looks', async (req) => {
    const q = z
      .object({
        featured: z.enum(['true', 'false']).optional(),
        store: z.string().max(80).optional(),
        limit: z.coerce.number().int().min(1).max(20).default(10),
      })
      .parse(req.query);
    return {
      items: await listLooks(app.ctx(req), { featured: q.featured === 'true', store: q.store, limit: q.limit }),
    };
  });

  app.get('/looks/:id', async (req) => {
    const { id } = LookParams.parse(req.params);
    return getLook(app.ctx(req), id);
  });

  /** Body: { variants?: { [productId]: variantId }, replaceCart?: boolean }. */
  app.post('/looks/:id/add-to-cart', async (req) => {
    const { id } = LookParams.parse(req.params);
    const body = z
      .object({ variants: z.record(Id, Id).optional(), replaceCart: z.boolean().default(false) })
      .parse(req.body ?? {});
    return addLookToCart(app.ctx(req), id, body.variants, body.replaceCart);
  });
}
