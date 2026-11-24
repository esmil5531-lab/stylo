import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { AppError, unauthorized } from '../../lib/errors.js';
import { createRateLimiter } from '../../lib/rate-limit.js';
import { requestOtp, revokeSession, verifyOtp } from './auth.service.js';

const Phone = z.string().trim().min(9).max(20);

export function bearerToken(header: string | undefined): string | null {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(header ?? '');
  return m ? m[1]! : null;
}

export async function authRoutes(app: FastifyInstance) {
  const perIp = createRateLimiter(app.config.auth.otpMaxPerIpHour, 3_600_000);

  app.post('/auth/otp/request', async (req, reply) => {
    const { phone } = z.object({ phone: Phone }).parse(req.body);
    const wait = perIp.hit(req.ip);
    if (wait > 0) {
      reply.header('retry-after', String(wait));
      throw new AppError(429, 'otp_ip_limit', 'طلبات رموز كثيرة من هذا الاتصال، حاولي بعد قليل', { retryAfter: wait });
    }
    return requestOtp(app.ctx(req), app.messenger, phone);
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
