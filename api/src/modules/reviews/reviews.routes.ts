import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { enforceLimit, optionalLimiter } from '../../lib/rate-limit.js';
import { IdParams, Pagination } from '../../lib/validation.js';
import { deleteOwnReview, listReviews, saveReview } from './reviews.service.js';

const ReviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(500).nullish(),
});

/** «التقييمات» of a product (public list; writing needs a delivered order of it). */
export async function reviewsRoutes(app: FastifyInstance) {
  const writes = optionalLimiter(app.config.limits.enabled, app.config.limits.reviewsPerUserHour, 3_600_000);
  app.get('/products/:id/reviews', async (req) => {
    const { id } = IdParams.parse(req.params);
    const { limit, offset } = Pagination.parse(req.query);
    return listReviews(app.ctx(req), id, limit, offset);
  });

  app.put('/products/:id/reviews/mine', async (req, reply) => {
    enforceLimit(writes, app.ctx(req).userId ?? req.ip, reply);
    const { id } = IdParams.parse(req.params);
    return saveReview(app.ctx(req), id, ReviewBody.parse(req.body));
  });

  app.delete('/products/:id/reviews/mine', async (req) => {
    const { id } = IdParams.parse(req.params);
    return deleteOwnReview(app.ctx(req), id);
  });
}
