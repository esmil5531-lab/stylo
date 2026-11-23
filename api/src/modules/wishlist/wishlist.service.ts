import { requireUser, type Ctx } from '../../lib/context.js';
import { notFound } from '../../lib/errors.js';
import { getProductsByIds } from '../catalog/catalog.service.js';

export async function listWishlist(ctx: Ctx) {
  const userId = requireUser(ctx);
  const { rows } = await ctx.db.query<{ product_id: string }>(
    `SELECT product_id FROM wishlist_items WHERE user_id = $1 ORDER BY added_at DESC`,
    [userId],
  );
  return getProductsByIds(
    ctx,
    rows.map((r) => r.product_id),
  );
}

export async function setWishlisted(ctx: Ctx, productId: string, wishlisted: boolean) {
  const userId = requireUser(ctx);
  if (wishlisted) {
    const { rowCount } = await ctx.db.query(
      `INSERT INTO wishlist_items (user_id, product_id)
       SELECT $1, id FROM products WHERE id = $2 AND status = 'active'
       ON CONFLICT DO NOTHING`,
      [userId, productId],
    );
    if (rowCount === 0) {
      const exists = await ctx.db.query(`SELECT 1 FROM products WHERE id = $1`, [productId]);
      if (exists.rowCount === 0) throw notFound('المنتج');
    }
  } else {
    await ctx.db.query(`DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2`, [userId, productId]);
  }
  return { productId, isWishlisted: wishlisted };
}
