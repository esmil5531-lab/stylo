import { AppError } from './errors.js';

/**
 * Small in-memory sliding-window limiter (one server process, as deployed).
 * Used for sign-in codes per IP: each code is a paid WhatsApp/SMS message, so one address must
 * not be able to send codes to hundreds of numbers. Libyan mobile networks put many customers
 * behind one IP (carrier NAT), so the limit is generous; per-phone limits stay in the database.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    /** Records a hit; returns the seconds to wait when over the limit, otherwise 0. */
    hit(key: string, now = Date.now()): number {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return Math.ceil((recent[0]! + windowMs - now) / 1000);
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 50_000) {
        for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      }
      return 0;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/** A limiter for one action, or null when limits are off (tests). */
export function optionalLimiter(enabled: boolean, limit: number, windowMs: number): RateLimiter | null {
  return enabled ? createRateLimiter(limit, windowMs) : null;
}

/** Counts a hit; over the limit → 429 with Retry-After and an Arabic message. */
export function enforceLimit(
  limiter: RateLimiter | null,
  key: string,
  reply: { header(name: string, value: string): unknown },
  code = 'rate_limited',
  message = 'طلبات كثيرة، حاولي بعد قليل',
): void {
  const wait = limiter?.hit(key) ?? 0;
  if (wait > 0) {
    reply.header('retry-after', String(wait));
    throw new AppError(429, code, message, { retryAfter: wait });
  }
}
