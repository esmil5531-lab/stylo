import type { FastifyInstance } from 'fastify';

import { getHome } from './home.service.js';

export async function homeRoutes(app: FastifyInstance) {
  app.get('/home', async (req) => getHome(app.ctx(req)));
}
