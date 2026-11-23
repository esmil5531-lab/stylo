import { requireUser, type Ctx } from '../../lib/context.js';
import { notFound } from '../../lib/errors.js';

/** City used for delivery estimates: the user's default address, else the platform default. */
export async function getCustomerCity(ctx: Ctx): Promise<string> {
  if (!ctx.userId) return ctx.config.defaultCity;
  const { rows } = await ctx.db.query<{ city: string }>(
    `SELECT city FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at LIMIT 1`,
    [ctx.userId],
  );
  return rows[0]?.city ?? ctx.config.defaultCity;
}

export async function getMe(ctx: Ctx) {
  const userId = requireUser(ctx);
  const { rows } = await ctx.db.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role,
            a.id AS address_id, a.label, a.city, a.district, a.street
       FROM users u
       LEFT JOIN LATERAL (
         SELECT * FROM addresses WHERE user_id = u.id ORDER BY is_default DESC, created_at LIMIT 1
       ) a ON true
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
    defaultAddress: r.address_id
      ? { id: r.address_id, label: r.label, city: r.city, district: r.district, street: r.street }
      : null,
  };
}
