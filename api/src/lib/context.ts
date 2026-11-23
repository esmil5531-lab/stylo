import type { Config } from '../config.js';
import type { Queryable } from '../db.js';
import { unauthorized } from './errors.js';

/** Everything a service needs for one request. */
export interface Ctx {
  db: Queryable;
  config: Config;
  userId: string | null;
  now: Date;
}

export function requireUser(ctx: Ctx): string {
  if (!ctx.userId) throw unauthorized();
  return ctx.userId;
}
