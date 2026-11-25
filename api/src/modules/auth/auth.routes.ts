import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { AppError, unauthorized } from '../../lib/errors.js';
import { createRateLimiter, enforceLimit, optionalLimiter } from '../../lib/rate-limit.js';
import { createGuest, refreshSession, requestOtp, revokeSession, verifyOtp } from './auth.service.js';

const Phone = z.string().trim().min(9).max(20);

export function bearerToken(header: string | undefined): string | null {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(header ?? '');
  return m ? m[1]! : null;
}

export async function authRoutes(app: FastifyInstance) {
  const perIp = createRateLimiter(app.config.auth.otpMaxPerIpHour, 3_600_000);
  const { limits } = app.config;
  const verifiesPerIp = optionalLimiter(limits.enabled, limits.otpVerifyPerIpHour, 3_600_000);
  const refreshesPerIp = optionalLimiter(limits.enabled, limits.refreshPerIpHour, 3_600_000);

  app.post('/auth/otp/request', async (req, reply) => {
    const { phone } = z.object({ phone: Phone }).parse(req.body);
    const wait = perIp.hit(req.ip);
    if (wait > 0) {
      reply.header('retry-after', String(wait));
      throw new AppError(429, 'otp_ip_limit', 'طلبات رموز كثيرة من هذا الاتصال، حاولي بعد قليل', { retryAfter: wait });
    }
    return requestOtp(app.ctx(req), app.messenger, phone);
  });

  app.post('/auth/otp/verify', async (req, reply) => {
    // Per phone: 5 wrong attempts per code. Per IP: guessing across many numbers.
    enforceLimit(verifiesPerIp, req.ip, reply, 'otp_verify_limit', 'محاولات كثيرة من هذا الاتصال، حاولي بعد قليل');
    const body = z
      .object({
        phone: Phone,
        code: z.string().trim().min(4).max(12),
        app: z.enum(['customer', 'admin']).default('customer'),
        fullName: z.string().trim().max(80).optional(),
      })
      .parse(req.body);
    const ctx = app.ctx(req);
    // Signing in from a guest session (its bearer token): the guest's cart moves to the account.
    return verifyOtp(ctx, { ...body, userAgent: req.headers['user-agent'], guestUserId: ctx.guest ? ctx.userId : null });
  });

  /** New access + refresh pair from a refresh token (rotation). No code, no bearer needed. */
  app.post('/auth/refresh', async (req, reply) => {
    enforceLimit(refreshesPerIp, req.ip, reply);
    const { refreshToken } = z.object({ refreshToken: z.string().regex(/^[A-Za-z0-9_-]{20,200}$/) }).parse(req.body);
    return refreshSession(app.ctx(req), refreshToken);
  });

  /** Anonymous guest session for browsing + cart (rate-limited per IP). */
  const guestsPerIp = createRateLimiter(app.config.auth.guestMaxPerIpHour, 3_600_000);
  app.post('/auth/guest', async (req, reply) => {
    const wait = guestsPerIp.hit(req.ip);
    if (wait > 0) {
      reply.header('retry-after', String(wait));
      throw new AppError(429, 'guest_limit', 'طلبات كثيرة من هذا الاتصال، حاولي بعد قليل', { retryAfter: wait });
    }
    reply.status(201);
    return createGuest(app.ctx(req), req.headers['user-agent']);
  });

  app.post('/auth/logout', async (req) => {
    const token = bearerToken(req.headers.authorization);
    if (!token) throw unauthorized();
    await revokeSession(app.db, token, new Date());
    return { ok: true };
  });
}
