import { z } from 'zod';

/** Any UUID-shaped id (seed data uses non-RFC ids such as 0000…0004). */
export const Id = z.guid();

export const Pagination = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const IdParams = z.object({ id: Id });
