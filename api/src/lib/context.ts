import type { Config } from '../config.js';
import type { Queryable } from '../db.js';
import { AppError, unauthorized } from './errors.js';

/** Everything a service needs for one request. */
export interface Ctx {
  db: Queryable;
  config: Config;
  userId: string | null;
  /** The caller is an anonymous guest (browsing + cart only; see migration 0012). */
  guest?: boolean;
  now: Date;
}

export function requireUser(ctx: Ctx): string {
  if (!ctx.userId) throw unauthorized();
  return ctx.userId;
}

/**
 * A signed-in customer account (phone verified). Guests get 401 `sign_in_required`, which the app
 * turns into the sign-in screen (checkout, orders, addresses, account).
 */
export function requireAccount(ctx: Ctx): string {
  const id = requireUser(ctx);
  if (ctx.guest) {
    throw new AppError(401, 'sign_in_required', 'سجّلي الدخول برقم هاتفك لإكمال هذه الخطوة');
  }
  return id;
}
