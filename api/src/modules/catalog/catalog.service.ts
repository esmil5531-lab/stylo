import type { Ctx } from '../../lib/context.js';
import { notFound } from '../../lib/errors.js';
import { mediaVariant } from '../../lib/media.js';
import { mapProductSummary, PRODUCT_SUMMARY_SELECT, type ProductSummary } from './product-summary.js';
import { coverageNote, getDeliveryArea, storeServed, type DeliveryArea } from '../../lib/coverage.js';

/** Home tabs: لأجلك · ترند · عروض · قريب منك. `new` stays available for links (e.g. banners). */
export const FEEDS = ['for_you', 'trending', 'offers', 'nearby', 'new'] as const;
export type Feed = (typeof FEEDS)[number];

/** Explicit sort chosen by the customer («ترتيب»); without it each feed keeps its own order. */
export const SORTS = ['newest', 'price_asc', 'price_desc', 'discount', 'popular'] as const;
export type Sort = (typeof SORTS)[number];

export interface ListProductsInput {
  feed?: Feed;
  category?: string;
  store?: string;
  q?: string;
  sort?: Sort;
  /** Sizes with stock (e.g. ['M', 'L'] or ['38']): a product matches if any of them is in stock. */
  sizes?: string[];
  /** Dirhams, compared with the product price. */
  minPrice?: number;
  maxPrice?: number;
  limit: number;
  offset: number;
}

/**
 * Arabic-insensitive search text: lower case, أ/إ/آ/ٱ → ا, ة → ه, ى → ي, no tatweel or harakat —
 * so «عبايه» finds «عباية» and «اسود» finds «أسود». The same mapping runs in SQL on the columns.
 */
const ALEFS = /[أإآٱ]/g;
const MARKS = /[ـً-ْ]/g;
export function normaliseSearch(q: string): string {
  return q.toLowerCase().replace(ALEFS, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(MARKS, '');
}
const normalisedSql = (col: string) =>
  `translate(lower(${col}), 'أإآٱةىـًٌٍَُِّْ', 'ااااهي')`;
const SEARCH_COLUMNS = [
  'p.name_ar',
  "coalesce(p.name_en, '')",
  "coalesce(p.brand, '')",
  's.name_ar',
  "coalesce(c.name_ar, '')",
  "coalesce(pc.name_ar, '')",
  "coalesce(c.name_en, '')",
];
const escapeLike = (w: string) => w.replace(/[%_\\]/g, (m) => `\\${m}`);

type Filters = Pick<ListProductsInput, 'category' | 'store' | 'q'>;

/** WHERE conditions shared by the list and its filter facets. */
function productFilters(input: Filters, add: (v: unknown) => string): string[] {
  const where: string[] = [];
  if (input.category) {
    // A main category lists its sub-categories' products too; hidden categories list nothing.
    const slug = add(input.category);
    where.push(`(c.slug = ${slug} OR pc.slug = ${slug}) AND c.is_active AND (pc.id IS NULL OR pc.is_active)`);
  }
  if (input.store) where.push(`s.slug = ${add(input.store)}`);
  if (input.q) {
    // Every word must appear in the product, its brand, its store or its (main) category.
    const words = normaliseSearch(input.q).split(/\s+/).filter(Boolean).slice(0, 6);
    for (const w of words) {
      const like = add(`%${escapeLike(w)}%`);
      where.push(`(${SEARCH_COLUMNS.map((col) => `${normalisedSql(col)} LIKE ${like}`).join(' OR ')})`);
    }
  }
  return where;
}

export interface ProductPage {
  items: ProductSummary[];
  /** Every matching product («N منتج», «تحميل المزيد»). */
  total: number;
  hasMore: boolean;
}

export async function listProducts(ctx: Ctx, input: ListProductsInput): Promise<ProductPage> {
  const area = await getDeliveryArea(ctx);
  const city = area.city;
  const params: unknown[] = [ctx.userId];
  const add = (v: unknown) => `$${params.push(v)}`;
  const where = productFilters(input, add);
  if (input.sizes?.length) {
    where.push(
      `EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id = p.id AND sv.stock_qty > 0 AND sv.size = ANY(${add(input.sizes)}::text[]))`,
    );
  }
  if (input.minPrice !== undefined) where.push(`p.base_price >= ${add(input.minPrice)}`);
  if (input.maxPrice !== undefined) where.push(`p.base_price <= ${add(input.maxPrice)}`);
  // The count query only has the filters: take its parameters now, before the ORDER BY ones
  // («قريب منك» sorts by the customer's city) and LIMIT/OFFSET — otherwise Postgres refuses it.
  const countParams = [...params];

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
      // Only bind the city when this order is used: a «ترتيب» below replaces it, and Postgres
      // refuses a parameter that the query never references.
      order = input.sort ? '' : `(s.city = ${add(city)}) DESC, s.prep_hours ASC, p.rating_avg DESC`;
      break;
    case 'for_you':
    default:
      // Personalisation placeholder: featured first, then quality signals.
      order = 'p.is_featured DESC, p.rating_avg DESC, p.rating_count DESC';
  }
  // «ترتيب» chosen by the customer wins over the feed's own order.
  switch (input.sort) {
    case 'newest':
      order = 'p.created_at DESC';
      break;
    case 'price_asc':
      order = 'p.base_price ASC';
      break;
    case 'price_desc':
      order = 'p.base_price DESC';
      break;
    case 'discount':
      order = 'COALESCE((p.compare_at_price - p.base_price)::numeric / NULLIF(p.compare_at_price, 0), 0) DESC';
      break;
    case 'popular':
      order = 'p.sold_count DESC, p.rating_avg DESC';
      break;
  }

  const filtered = `${PRODUCT_SUMMARY_SELECT} ${where.length ? `AND ${where.join(' AND ')}` : ''}`;
  const [list, count] = await Promise.all([
    ctx.db.query(`${filtered} ORDER BY ${order}, p.id LIMIT ${add(input.limit)} OFFSET ${add(input.offset)}`, params),
    ctx.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${filtered}) x`, countParams),
  ]);
  const total = count.rows[0]?.n ?? 0;
  return {
    items: list.rows.map((r) => mapProductSummary(r, ctx, area)),
    total,
    hasMore: input.offset + list.rows.length < total,
  };
}

/**
 * «فلترة»: the sizes in stock and the price range of the products matching the same category /
 * store / search / feed — so the filter sheet only offers choices that give results.
 */
export async function productFacets(ctx: Ctx, input: Filters & { feed?: Feed }) {
  const params: unknown[] = [ctx.userId];
  const add = (v: unknown) => `$${params.push(v)}`;
  const where = productFilters(input, add);
  if (input.feed === 'offers') where.push('p.compare_at_price > p.base_price');
  const base = `${PRODUCT_SUMMARY_SELECT} ${where.length ? `AND ${where.join(' AND ')}` : ''}`;
  const [sizes, prices] = await Promise.all([
    ctx.db.query(
      `SELECT v.size, count(DISTINCT v.product_id)::int AS n
         FROM product_variants v
        WHERE v.product_id IN (SELECT x.id FROM (${base}) x) AND v.size IS NOT NULL AND v.stock_qty > 0
        GROUP BY v.size`,
      params,
    ),
    ctx.db.query(`SELECT min(x.base_price)::bigint AS min, max(x.base_price)::bigint AS max FROM (${base}) x`, params),
  ]);
  return {
    sizes: sortSizes(sizes.rows.map((r) => ({ size: r.size as string, count: r.n as number }))),
    price: { min: Number(prices.rows[0]?.min ?? 0), max: Number(prices.rows[0]?.max ?? 0) },
  };
}

const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL'];
/** Letter sizes in their natural order, then numbers ascending, then the rest alphabetically. */
export function sortSizes<T extends { size: string }>(list: T[]): T[] {
  const rank = (s: string): [number, number, string] => {
    const i = LETTER_SIZES.indexOf(s.toUpperCase());
    if (i >= 0) return [0, i, s];
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? [1, n, s] : [2, 0, s];
  };
  return [...list].sort((a, b) => {
    const [ga, va, sa] = rank(a.size);
    const [gb, vb, sb] = rank(b.size);
    return ga - gb || va - vb || sa.localeCompare(sb, 'ar');
  });
}

/** Product cards for the given ids, in the given order. */
export async function getProductsByIds(ctx: Ctx, ids: string[], area?: DeliveryArea): Promise<ProductSummary[]> {
  if (ids.length === 0) return [];
  const c = area ?? (await getDeliveryArea(ctx));
  const { rows } = await ctx.db.query(`${PRODUCT_SUMMARY_SELECT} AND p.id = ANY($2::uuid[])`, [ctx.userId, ids]);
  const byId = new Map(rows.map((r) => [r.id as string, mapProductSummary(r, ctx, c)]));
  return ids.map((id) => byId.get(id)).filter((p): p is ProductSummary => !!p);
}

export async function getProduct(ctx: Ctx, id: string) {
  const area = await getDeliveryArea(ctx);
  const [summary] = await getProductsByIds(ctx, [id], area);
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
    /** Shown instead of «يصلك…» when the customer's address is outside the delivery area. */
    coverageNote: coverageNote(area),
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

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  icon: string | null;
  color: string | null;
  imageUrl: string | null;
  /** Active products in this category and, for a main category, in its sub-categories. */
  productCount: number;
  children: CategoryNode[];
}

/**
 * The visible category tree: main categories in their order, each with its visible
 * sub-categories. Hidden categories (and the sub-categories of a hidden one) are left out.
 */
export async function listCategories(ctx: Ctx): Promise<CategoryNode[]> {
  const { rows } = await ctx.db.query(
    `SELECT c.id, c.slug, c.name_ar, c.parent_id, c.icon, c.color, c.image_url,
            (SELECT count(*) FROM products p JOIN stores s ON s.id = p.store_id AND s.status = 'active' AND ${storeServed()}
               LEFT JOIN categories pc ON pc.id = p.category_id
              WHERE p.status = 'active' AND (p.category_id = c.id OR (pc.parent_id = c.id AND pc.is_active)))::int
              AS product_count
       FROM categories c
       LEFT JOIN categories parent ON parent.id = c.parent_id
      WHERE c.is_active AND (parent.id IS NULL OR parent.is_active)
      ORDER BY c.sort_order, c.name_ar`,
  );
  const nodes = rows.map(
    (r): CategoryNode => ({
      id: r.id,
      slug: r.slug,
      name: r.name_ar,
      parentId: r.parent_id,
      icon: r.icon,
      color: r.color,
      imageUrl: mediaVariant(r.image_url as string | null, 800),
      productCount: r.product_count,
      children: [],
    }),
  );
  // Customers never see an empty shelf: categories without products on sale are left out (they
  // stay in the back office, and come back as soon as a product is filed there).
  const stocked = nodes.filter((n) => n.productCount > 0);
  const byId = new Map(stocked.map((n) => [n.id, n]));
  for (const n of stocked) if (n.parentId) byId.get(n.parentId)?.children.push(n);
  return stocked.filter((n) => !n.parentId);
}
