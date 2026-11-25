import { inTransaction, type Queryable } from '../../db.js';
import { requireAccount, type Ctx } from '../../lib/context.js';
import { forbidden, notFound } from '../../lib/errors.js';

/**
 * «التقييمات» — real reviews only: a customer can rate a product (1–5 stars + optional text)
 * once she has **received** it (a delivered order containing it). One review per product per
 * customer, editable. Stylo staff can hide a review (abuse, personal data); hidden reviews are
 * not listed and do not count. products.rating_avg / rating_count follow every change.
 */

export interface ReviewInput {
  rating: number;
  body?: string | null;
}

/** «سارة أ.» — first name + initial of the last, never the full name or phone. */
function displayName(full: string | null): string {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'زبونة ستايلو';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : parts[0]!;
}

/** Recomputes the denormalised rating of a product from its visible reviews. */
export async function refreshProductRating(db: Queryable, productId: string): Promise<void> {
  await db.query(
    `UPDATE products p SET rating_count = x.n, rating_avg = COALESCE(round(x.avg, 1), 0)
       FROM (SELECT count(*)::int AS n, avg(rating)::numeric AS avg
               FROM reviews WHERE product_id = $1 AND NOT is_hidden) x
      WHERE p.id = $1`,
    [productId],
  );
}

/** The newest delivered order line of this product for this customer (proof of purchase). */
async function deliveredItem(db: Queryable, userId: string, productId: string): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT oi.id FROM order_items oi
       JOIN orders o ON o.id = oi.order_id AND o.status = 'delivered' AND o.customer_id = $1
       JOIN product_variants v ON v.id = oi.variant_id AND v.product_id = $2
      ORDER BY o.placed_at DESC LIMIT 1`,
    [userId, productId],
  );
  return (rows[0]?.id as string | undefined) ?? null;
}

export async function listReviews(ctx: Ctx, productId: string, limit: number, offset: number) {
  const exists = await ctx.db.query(`SELECT 1 FROM products WHERE id = $1 AND status = 'active'`, [productId]);
  if (!exists.rows[0]) throw notFound('المنتج');
  const [items, summary, mine] = await Promise.all([
    ctx.db.query(
      `SELECT r.id, r.rating, r.body, r.created_at, r.updated_at, u.full_name, u.deleted_at
         FROM reviews r JOIN users u ON u.id = r.user_id
        WHERE r.product_id = $1 AND NOT r.is_hidden
        ORDER BY (r.body IS NOT NULL AND r.body <> '') DESC, r.created_at DESC
        LIMIT $2 OFFSET $3`,
      [productId, limit, offset],
    ),
    ctx.db.query(
      `SELECT count(*)::int AS n, round(avg(rating)::numeric, 1) AS avg,
              count(*) FILTER (WHERE rating = 5)::int AS r5, count(*) FILTER (WHERE rating = 4)::int AS r4,
              count(*) FILTER (WHERE rating = 3)::int AS r3, count(*) FILTER (WHERE rating = 2)::int AS r2,
              count(*) FILTER (WHERE rating = 1)::int AS r1
         FROM reviews WHERE product_id = $1 AND NOT is_hidden`,
      [productId],
    ),
    ctx.userId && !ctx.guest
      ? Promise.all([
          ctx.db.query(`SELECT rating, body, is_hidden FROM reviews WHERE product_id = $1 AND user_id = $2`, [
            productId,
            ctx.userId,
          ]),
          deliveredItem(ctx.db, ctx.userId, productId),
        ])
      : null,
  ]);
  const s = summary.rows[0];
  const my = mine?.[0].rows[0];
  return {
    items: items.rows.map((r) => ({
      id: r.id as string,
      rating: r.rating as number,
      body: (r.body as string | null) || null,
      author: r.deleted_at ? 'زبونة ستايلو' : displayName(r.full_name as string),
      createdAt: (r.created_at as Date).toISOString(),
      edited: (r.updated_at as Date).getTime() - (r.created_at as Date).getTime() > 60_000,
    })),
    summary: {
      count: s.n as number,
      average: s.avg === null ? 0 : Number(s.avg),
      distribution: { 5: s.r5, 4: s.r4, 3: s.r3, 2: s.r2, 1: s.r1 } as Record<1 | 2 | 3 | 4 | 5, number>,
    },
    /** Signed-in customer only: her review, and whether she may write one (product received). */
    mine: my ? { rating: my.rating as number, body: (my.body as string | null) || null, hidden: my.is_hidden as boolean } : null,
    canReview: mine ? mine[1] !== null : false,
  };
}

export async function saveReview(ctx: Ctx, productId: string, input: ReviewInput) {
  const userId = requireAccount(ctx);
  await inTransaction(ctx.db, async (db) => {
    const item = await deliveredItem(db, userId, productId);
    if (!item) throw forbidden('يمكنك تقييم القطع التي استلمتِها فقط');
    const body = input.body?.trim() || null;
    await db.query(
      `INSERT INTO reviews (product_id, user_id, order_item_id, rating, body)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (product_id, user_id) DO UPDATE
         SET rating = EXCLUDED.rating, body = EXCLUDED.body, order_item_id = EXCLUDED.order_item_id,
             updated_at = now()`,
      [productId, userId, item, input.rating, body],
    );
    await refreshProductRating(db, productId);
  });
  return listReviews(ctx, productId, 10, 0);
}

export async function deleteOwnReview(ctx: Ctx, productId: string) {
  const userId = requireAccount(ctx);
  await inTransaction(ctx.db, async (db) => {
    const { rowCount } = await db.query(`DELETE FROM reviews WHERE product_id = $1 AND user_id = $2`, [productId, userId]);
    if (!rowCount) throw notFound('التقييم');
    await refreshProductRating(db, productId);
  });
  return { ok: true };
}

// ----------------------------------------------------------------------------- back office

/** Latest reviews for moderation (reviews.manage — Stylo staff only, never the store itself). */
export async function listAdminReviews(db: Queryable, opts: { hidden?: boolean; limit: number; offset: number }) {
  const { rows } = await db.query(
    `SELECT r.id, r.rating, r.body, r.is_hidden, r.created_at, p.id AS product_id, p.name_ar AS product_name,
            s.name_ar AS store_name, u.full_name, u.phone, count(*) OVER () AS total
       FROM reviews r JOIN products p ON p.id = r.product_id JOIN stores s ON s.id = p.store_id
       JOIN users u ON u.id = r.user_id
      WHERE ($1::boolean IS NULL OR r.is_hidden = $1)
      ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
    [opts.hidden ?? null, opts.limit, opts.offset],
  );
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    items: rows.map((r) => ({
      id: r.id as string,
      rating: r.rating as number,
      body: (r.body as string | null) || null,
      hidden: r.is_hidden as boolean,
      createdAt: (r.created_at as Date).toISOString(),
      product: { id: r.product_id as string, name: r.product_name as string },
      storeName: r.store_name as string,
      customer: { name: r.full_name as string, phone: r.phone as string | null },
    })),
  };
}

export async function setReviewHidden(db: Queryable, staffId: string, id: string, hidden: boolean) {
  await inTransaction(db, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE reviews SET is_hidden = $2, hidden_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END WHERE id = $1
       RETURNING product_id`,
      [id, hidden, staffId],
    );
    if (!rows[0]) throw notFound('التقييم');
    await refreshProductRating(tx, rows[0].product_id as string);
  });
  return { ok: true, hidden };
}
