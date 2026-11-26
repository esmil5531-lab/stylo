import type { Queryable } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { badRequest, notFound } from '../../lib/errors.js';
import type { StaffContext } from './permissions.js';

/**
 * Customer delivery record («سجل الزبون») shown with each order, and the block decision.
 * Failed deliveries are counted from the orders themselves (orders.delivery_failure, migration
 * 0012): no separate counter that could drift. «refused» + «no_answer» are the ones that cost a
 * trip for nothing; at REFUSAL_WARN_AT of them the back office warns. Blocking is a staff decision
 * (customers.block): a blocked customer can browse but cannot check out.
 */
export interface CustomerRecord {
  delivered: number;
  failed: { refused: number; noAnswer: number; wrongAddress: number; postponed: number };
  /** refused + no answer. */
  refusals: number;
  cancelledBeforeShipping: number;
  warn: boolean;
  blocked: { at: string; reason: string; by: string | null } | null;
}

export async function customerRecord(db: Queryable, customerId: string, warnAt: number): Promise<CustomerRecord> {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE o.status = 'delivered')::int AS delivered,
            count(*) FILTER (WHERE o.delivery_failure = 'refused')::int AS refused,
            count(*) FILTER (WHERE o.delivery_failure = 'no_answer')::int AS no_answer,
            count(*) FILTER (WHERE o.delivery_failure = 'wrong_address')::int AS wrong_address,
            count(*) FILTER (WHERE o.delivery_failure = 'postponed')::int AS postponed,
            count(*) FILTER (WHERE o.status = 'cancelled' AND o.delivery_failure IS NULL)::int AS cancelled,
            u.blocked_at, u.blocked_reason, b.full_name AS blocked_by
       FROM users u
       LEFT JOIN orders o ON o.customer_id = u.id
       LEFT JOIN users b ON b.id = u.blocked_by
      WHERE u.id = $1
      GROUP BY u.id, b.full_name`,
    [customerId],
  );
  const r = rows[0];
  if (!r) throw notFound('الزبون');
  const refusals = r.refused + r.no_answer;
  return {
    delivered: r.delivered,
    failed: { refused: r.refused, noAnswer: r.no_answer, wrongAddress: r.wrong_address, postponed: r.postponed },
    refusals,
    cancelledBeforeShipping: r.cancelled,
    warn: refusals >= warnAt,
    blocked: r.blocked_at ? { at: (r.blocked_at as Date).toISOString(), reason: r.blocked_reason, by: r.blocked_by } : null,
  };
}

export async function setCustomerBlocked(
  ctx: Ctx,
  staff: StaffContext,
  customerId: string,
  input: { blocked: boolean; reason?: string },
): Promise<CustomerRecord> {
  const { rows } = await ctx.db.query(`SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL`, [customerId]);
  if (!rows[0] || rows[0].role !== 'customer') throw notFound('الزبون');
  if (input.blocked) {
    const reason = input.reason?.trim();
    if (!reason) throw badRequest('reason_required', 'اكتب سبب الحظر (يظهر لفريق ستايلو)');
    await ctx.db.query(`UPDATE users SET blocked_at = $2, blocked_reason = $3, blocked_by = $4 WHERE id = $1`, [
      customerId,
      ctx.now,
      reason,
      staff.userId,
    ]);
  } else {
    await ctx.db.query(`UPDATE users SET blocked_at = NULL, blocked_reason = NULL, blocked_by = NULL WHERE id = $1`, [customerId]);
  }
  return customerRecord(ctx.db, customerId, ctx.config.returns.refusalWarnAt);
}
