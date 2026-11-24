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
