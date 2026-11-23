import type { Ctx } from '../../lib/context.js';
import { notFound } from '../../lib/errors.js';
import { getProductsByIds } from '../catalog/catalog.service.js';
import type { ProductSummary } from '../catalog/product-summary.js';
import { getCustomerCity } from '../users/users.service.js';

/** A curated outfit ("كمّل اللوك"). Every look belongs to one store (migration 0003). */
export interface Look {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  store: { id: string; slug: string; name: string; logoText: string; brandColor: string | null };
  items: ProductSummary[];
  /** Sum of item prices (dirhams). */
  totalPrice: number;
}

const LOOK_SELECT = `
  SELECT l.id, l.slug, l.title_ar, l.subtitle_ar, l.cover_url,
         s.id AS store_id, s.slug AS store_slug, s.name_ar AS store_name, s.logo_text, s.brand_color,
         array_agg(li.product_id ORDER BY li.position) AS product_ids
    FROM looks l
    JOIN stores s ON s.id = l.store_id AND s.status = 'active'
    JOIN look_items li ON li.look_id = l.id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toLook(ctx: Ctx, r: any, city: string): Promise<Look> {
  const items = await getProductsByIds(ctx, r.product_ids as string[], city);
  return {
    id: r.id,
    slug: r.slug,
    title: r.title_ar,
    subtitle: r.subtitle_ar,
    coverUrl: r.cover_url,
    store: {
      id: r.store_id,
      slug: r.store_slug,
      name: r.store_name,
      logoText: r.logo_text ?? r.store_name,
      brandColor: r.brand_color,
    },
    items,
    totalPrice: items.reduce((s, p) => s + p.price, 0),
  };
}

export async function listLooks(
  ctx: Ctx,
  opts: { featured?: boolean; store?: string; limit: number },
): Promise<Look[]> {
  const params: unknown[] = [opts.limit];
  const filters = ['l.is_active'];
  if (opts.featured) filters.push('l.is_featured');
  if (opts.store) filters.push(`s.slug = $${params.push(opts.store)}`);
  const { rows } = await ctx.db.query(
    `${LOOK_SELECT}
      WHERE ${filters.join(' AND ')}
      GROUP BY l.id, s.id
      ORDER BY l.is_featured DESC, l.sort_order, l.created_at DESC
      LIMIT $1`,
    params,
  );
  const city = await getCustomerCity(ctx);
  return Promise.all(rows.map((r) => toLook(ctx, r, city)));
}

export async function getLook(ctx: Ctx, idOrSlug: string): Promise<Look> {
  const { rows } = await ctx.db.query(
    `${LOOK_SELECT} WHERE l.is_active AND (l.id::text = $1 OR l.slug = $1) GROUP BY l.id, s.id`,
    [idOrSlug],
  );
  if (!rows[0]) throw notFound('اللوك');
  return toLook(ctx, rows[0], await getCustomerCity(ctx));
}
