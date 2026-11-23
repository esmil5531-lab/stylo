import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { Id } from '../../lib/validation.js';
import {
  addToCart,
  clearCart,
  getCart,
  getSharedCart,
  importSharedCart,
  setCartQuantity,
  shareCart,
} from './cart.service.js';

const ReplaceBody = z.object({ replaceCart: z.boolean().default(false) });
const TokenParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) });

export async function cartRoutes(app: FastifyInstance) {
  /** The single-store cart with both delivery options quoted («أسرع توصيل» / «توصيل عادي»). */
  app.get('/cart', async (req) => getCart(app.ctx(req)));

  app.post('/cart/items', async (req) => {
    const body = z
      .object({
        variantId: Id,
        quantity: z.number().int().min(1).max(20).default(1),
        /** true = empty the current cart (another store) and start a new one. */
        replaceCart: z.boolean().default(false),
      })
      .parse(req.body);
    return addToCart(app.ctx(req), body.variantId, body.quantity, body.replaceCart);
  });

  app.patch('/cart/items/:variantId', async (req) => {
    const { variantId } = z.object({ variantId: Id }).parse(req.params);
    const { quantity } = z.object({ quantity: z.number().int().min(0).max(20) }).parse(req.body);
    return setCartQuantity(app.ctx(req), variantId, quantity);
  });

  app.delete('/cart/items/:variantId', async (req) => {
    const { variantId } = z.object({ variantId: Id }).parse(req.params);
    return setCartQuantity(app.ctx(req), variantId, 0);
  });

  app.delete('/cart', async (req) => clearCart(app.ctx(req)));

  // ------------------------------------------------------------ sharing
  app.post('/cart/share', async (req, reply) => {
    reply.status(201);
    return shareCart(app.ctx(req));
  });

  app.get('/shared-carts/:token', async (req) => {
    const { token } = TokenParams.parse(req.params);
    return getSharedCart(app.ctx(req), token);
  });

  app.post('/shared-carts/:token/import', async (req) => {
    const { token } = TokenParams.parse(req.params);
    const { replaceCart } = ReplaceBody.parse(req.body ?? {});
    return importSharedCart(app.ctx(req), token, replaceCart);
  });
}
