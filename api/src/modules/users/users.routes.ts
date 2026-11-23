import type { FastifyInstance } from 'fastify';

import { getMe } from './users.service.js';

export async function usersRoutes(app: FastifyInstance) {
  app.get('/me', async (req) => getMe(app.ctx(req)));
}
