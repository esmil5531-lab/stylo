import { requireAccount, type Ctx } from '../../lib/context.js';
import { inTransaction } from '../../db.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { mapAddress } from './addresses.service.js';

/** City used for delivery estimates: the user's default address, else the platform default. */
export async function getCustomerCity(ctx: Ctx): Promise<string> {
  if (!ctx.userId) return ctx.config.defaultCity;
  const { rows } = await ctx.db.query<{ city: string }>(
    `SELECT city FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, updated_at DESC LIMIT 1`,
    [ctx.userId],
  );
  return rows[0]?.city ?? ctx.config.defaultCity;
}

export async function getMe(ctx: Ctx) {
  const userId = requireAccount(ctx);
  const { rows } = await ctx.db.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role,
            (SELECT row_to_json(a) FROM (
               SELECT * FROM addresses WHERE user_id = u.id ORDER BY is_default DESC, updated_at DESC LIMIT 1
             ) a) AS address,
            (SELECT count(*)::int FROM addresses WHERE user_id = u.id) AS addresses_count
       FROM users u
      WHERE u.id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r) throw notFound('المستخدم');
  return {
    id: r.id as string,
    fullName: r.full_name as string,
    email: r.email as string | null,
    phone: r.phone as string | null,
    role: r.role as string,
    defaultAddress: r.address ? mapAddress(r.address) : null,
    addressesCount: r.addresses_count as number,
  };
}

/**
 * «حذف حسابي» (required by Google Play and the App Store). Personal data is erased for good:
 * name, phone, addresses, cart, favourites, shared carts, reviews, sign-in codes, message log and
 * sessions. The `users` row stays as «حساب محذوف» because past orders (accounting, store payouts)
 * reference it; their delivery address is scrubbed down to the city. The same number can sign up
 * again later as a new, empty account.
 *
 * Refused while an order is still on its way (cancel it or wait for delivery), and for staff,
 * store owners and drivers (their accounts are managed in the back office).
 */
export async function deleteAccount(ctx: Ctx) {
  if (!ctx.userId) throw notFound('الحساب');
  const userId = ctx.userId;
  await inTransaction(ctx.db, async (db) => {
    const { rows } = await db.query(`SELECT role::text AS role, phone FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [
      userId,
    ]);
    const u = rows[0];
    if (!u) throw notFound('الحساب');
    if (u.role === 'guest') {
      await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
      return;
    }
    if (u.role !== 'customer') {
      throw forbidden('حسابات الموظفين والمتاجر والمناديب تُدار من لوحة الإدارة. تواصلي مع المدير');
    }
    const active = await db.query(
      `SELECT count(*)::int AS n FROM orders WHERE customer_id = $1 AND status IN ('pending', 'confirmed', 'processing', 'shipped')`,
      [userId],
    );
    if (active.rows[0].n > 0) {
      throw conflict('active_orders', 'لديك طلبات قيد التنفيذ. انتظري تسليمها أو ألغيها، ثم احذفي الحساب');
    }
    // Past orders keep their amounts (accounting) but lose who and where.
    await db.query(
      `UPDATE orders SET shipping_address = jsonb_build_object('city', shipping_address->>'city', 'recipient_name', 'حساب محذوف')
        WHERE customer_id = $1`,
      [userId],
    );
    const reviewed = await db.query(`DELETE FROM reviews WHERE user_id = $1 RETURNING product_id`, [userId]);
    for (const productId of new Set(reviewed.rows.map((r) => r.product_id as string))) {
      await db.query(
        `UPDATE products p SET rating_count = x.n, rating_avg = COALESCE(x.avg, 0)
           FROM (SELECT count(*)::int AS n, round(avg(rating)::numeric, 2) AS avg FROM reviews WHERE product_id = $1) x
          WHERE p.id = $1`,
        [productId],
      );
    }
    await db.query(`DELETE FROM addresses WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM carts WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM wishlist_items WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM shared_carts WHERE owner_id = $1`, [userId]);
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
    if (u.phone) {
      await db.query(`DELETE FROM otp_codes WHERE phone = $1`, [u.phone]);
      await db.query(`DELETE FROM message_log WHERE to_phone = $1`, [u.phone]);
    }
    await db.query(
      `UPDATE users SET full_name = 'حساب محذوف', phone = NULL, email = NULL, password_hash = NULL, deleted_at = $2
        WHERE id = $1`,
      [userId, ctx.now],
    );
  });
  return { ok: true };
}
