import type { Ctx } from '../../lib/context.js';
import { notFound } from '../../lib/errors.js';
import { getCustomerCity } from '../users/users.service.js';
import { mapProductSummary, PRODUCT_SUMMARY_SELECT, type ProductSummary } from './product-summary.js';

/** Home tabs: لأجلك · ترند · عروض · قريب منك. `new` stays available for links (e.g. banners). */
export const FEEDS = ['for_you', 'trending', 'offers', 'nearby', 'new'] as const;
export type Feed = (typeof FEEDS)[number];

export interface ListProductsInput {
  feed?: Feed;
  category?: string;
  store?: string;
  q?: string;
  limit: number;
  offset: number;
}

export async function listProducts(ctx: Ctx, input: ListProductsInput): Promise<ProductSummary[]> {
  const city = await getCustomerCity(ctx);
  const params: unknown[] = [ctx.userId];
  const where: string[] = [];
  const add = (v: unknown) => `$${params.push(v)}`;

  if (input.category) where.push(`c.slug = ${add(input.category)}`);
  if (input.store) where.push(`s.slug = ${add(input.store)}`);
  if (input.q) {
    const escaped = input.q.replace(/[\\%_]/g, (m) => '\\' + m);
    const like = add('%' + escaped + '%');
    where.push(
      `(p.name_ar ILIKE ${like} OR p.name_en ILIKE ${like} OR p.brand ILIKE ${like} OR s.name_ar ILIKE ${like})`,
    );
  }

  let order: string;
  switch (input.feed) {
    case 'trending':
      order = 'p.sold_count DESC, p.rating_avg DESC';
      break;
    case 'new':
      order = 'p.created_at DESC';
      break;
    case 'offers':
      // Discounted products only, biggest discount first.
      where.push('p.compare_at_price > p.base_price');
      order = '(p.compare_at_price - p.base_price)::numeric / p.compare_at_price DESC, p.sold_count DESC';
      break;
    case 'nearby':
      order = `(s.city = ${add(city)}) DESC, s.prep_hours ASC, p.rating_avg DESC`;
      break;
    case 'for_you':
    default:
      // Personalisation placeholder: featured first, then quality signals.
      order = 'p.is_featured DESC, p.rating_avg DESC, p.rating_count DESC';
  }

  const sql = `${PRODUCT_SUMMARY_SELECT}
    ${where.length ? `AND ${where.join(' AND ')}` : ''}
    ORDER BY ${order}, p.id
    LIMIT ${add(input.limit)} OFFSET ${add(input.offset)}`;
  const { rows } = await ctx.db.query(sql, params);
  return rows.map((r) => mapProductSummary(r, ctx, city));
}

/** Product cards for the given ids, in the given order. */
export async function getProductsByIds(ctx: Ctx, ids: string[], city?: string): Promise<ProductSummary[]> {
  if (ids.length === 0) return [];
  const c = city ?? (await getCustomerCity(ctx));
  const { rows } = await ctx.db.query(`${PRODUCT_SUMMARY_SELECT} AND p.id = ANY($2::uuid[])`, [ctx.userId, ids]);
  const byId = new Map(rows.map((r) => [r.id as string, mapProductSummary(r, ctx, c)]));
  return ids.map((id) => byId.get(id)).filter((p): p is ProductSummary => !!p);
}

export async function getProduct(ctx: Ctx, id: string) {
  const [summary] = await getProductsByIds(ctx, [id]);
  if (!summary) throw notFound('المنتج');

  const [details, variants, images] = await Promise.all([
    ctx.db.query(`SELECT description_ar FROM products WHERE id = $1`, [id]),
    ctx.db.query(
      `SELECT v.id, v.sku, v.size, v.color_name_ar, v.color_hex, COALESCE(v.price, p.base_price) AS price, v.stock_qty
         FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.product_id = $1 ORDER BY v.position, v.sku`,
      [id],
    ),
    ctx.db.query(`SELECT url, alt_ar FROM product_images WHERE product_id = $1 ORDER BY sort_order`, [id]),
  ]);

  return {
    ...summary,
    description: (details.rows[0]?.description_ar as string | undefined) ?? null,
    images: images.rows.map((r) => ({ url: r.url as string, alt: r.alt_ar as string | null })),
    variants: variants.rows.map((r) => ({
      id: r.id as string,
      sku: r.sku as string,
      size: r.size as string | null,
      colorName: r.color_name_ar as string | null,
      colorHex: r.color_hex as string | null,
      price: r.price as number,
      stock: r.stock_qty as number,
    })),
  };
}

/** "كمّل اللوك" for one product: the other pieces of the looks it belongs to. */
export async function completeTheLook(ctx: Ctx, productId: string, limit = 8): Promise<ProductSummary[]> {
  const { rows } = await ctx.db.query<{ product_id: string }>(
    `SELECT li.product_id
       FROM look_items mine
       JOIN looks l ON l.id = mine.look_id AND l.is_active
       JOIN look_items li ON li.look_id = mine.look_id AND li.product_id <> mine.product_id
      WHERE mine.product_id = $1
      GROUP BY li.product_id
      ORDER BY MIN(l.sort_order), MIN(li.position)
      LIMIT $2`,
    [productId, limit],
  );
  return getProductsByIds(
    ctx,
    rows.map((r) => r.product_id),
  );
}

export async function listCategories(ctx: Ctx) {
  const { rows } = await ctx.db.query(
    `SELECT c.id, c.slug, c.name_ar, c.parent_id,
            (SELECT count(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active')::int AS product_count
       FROM categories c ORDER BY c.sort_order, c.name_ar`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    name: r.name_ar as string,
    parentId: r.parent_id as string | null,
    productCount: r.product_count as number,
  }));
}
