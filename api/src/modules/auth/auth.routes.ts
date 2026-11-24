import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { unauthorized } from '../../lib/errors.js';
import { createSmsSender } from '../../lib/sms.js';
import { requestOtp, revokeSession, verifyOtp } from './auth.service.js';

const Phone = z.string().trim().min(9).max(20);

export function bearerToken(header: string | undefined): string | null {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(header ?? '');
  return m ? m[1]! : null;
}

export async function authRoutes(app: FastifyInstance) {
  const sms = createSmsSender(app.config.sms, (msg) => app.log.info(msg));

  app.post('/auth/otp/request', async (req) => {
    const { phone } = z.object({ phone: Phone }).parse(req.body);
    return requestOtp(app.ctx(req), sms, phone);
  });

  app.post('/auth/otp/verify', async (req) => {
    const body = z
      .object({
        phone: Phone,
        code: z.string().trim().min(4).max(12),
        app: z.enum(['customer', 'admin']).default('customer'),
        fullName: z.string().trim().max(80).optional(),
      })
      .parse(req.body);
    return verifyOtp(app.ctx(req), { ...body, userAgent: req.headers['user-agent'] });
  });

  app.post('/auth/logout', async (req) => {
    const token = bearerToken(req.headers.authorization);
    if (!token) throw unauthorized();
    await revokeSession(app.db, token, new Date());
    return { ok: true };
  });
}
