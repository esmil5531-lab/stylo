import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { Id } from '../../lib/validation.js';
import { listWishlist, setWishlisted } from './wishlist.service.js';

const Params = z.object({ productId: Id });

export async function wishlistRoutes(app: FastifyInstance) {
  app.get('/wishlist', async (req) => ({ items: await listWishlist(app.ctx(req)) }));

  app.put('/wishlist/:productId', async (req) => {
    const { productId } = Params.parse(req.params);
    return setWishlisted(app.ctx(req), productId, true);
  });

  app.delete('/wishlist/:productId', async (req) => {
    const { productId } = Params.parse(req.params);
    return setWishlisted(app.ctx(req), productId, false);
  });
}
