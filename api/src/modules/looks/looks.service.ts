import type { Ctx } from '../../lib/context.js';
import { notFound } from '../../lib/errors.js';
import { getProductsByIds } from '../catalog/catalog.service.js';
import type { ProductSummary } from '../catalog/product-summary.js';
import { getCustomerCity } from '../users/users.service.js';

export interface Look {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  items: ProductSummary[];
  /** Sum of item prices (dirhams). */
  totalPrice: number;
  storeCount: number;
}

export async function listLooks(ctx: Ctx, opts: { featured?: boolean; limit: number }): Promise<Look[]> {
  const { rows } = await ctx.db.query(
    `SELECT l.id, l.slug, l.title_ar, l.subtitle_ar, l.cover_url,
            array_agg(li.product_id ORDER BY li.position) AS product_ids
       FROM looks l JOIN look_items li ON li.look_id = l.id
      WHERE l.is_active ${opts.featured ? 'AND l.is_featured' : ''}
      GROUP BY l.id
      ORDER BY l.is_featured DESC, l.sort_order, l.created_at DESC
      LIMIT $1`,
    [opts.limit],
  );
  const city = await getCustomerCity(ctx);
  return Promise.all(
    rows.map(async (r) => {
      const items = await getProductsByIds(ctx, r.product_ids as string[], city);
      return {
        id: r.id,
        slug: r.slug,
        title: r.title_ar,
        subtitle: r.subtitle_ar,
        coverUrl: r.cover_url,
        items,
        totalPrice: items.reduce((s, p) => s + p.price, 0),
        storeCount: new Set(items.map((p) => p.store.id)).size,
      };
    }),
  );
}

export async function getLook(ctx: Ctx, idOrSlug: string): Promise<Look> {
  const { rows } = await ctx.db.query(
    `SELECT l.id, l.slug, l.title_ar, l.subtitle_ar, l.cover_url,
            array_agg(li.product_id ORDER BY li.position) AS product_ids
       FROM looks l JOIN look_items li ON li.look_id = l.id
      WHERE l.is_active AND (l.id::text = $1 OR l.slug = $1)
      GROUP BY l.id`,
    [idOrSlug],
  );
  const r = rows[0];
  if (!r) throw notFound('اللوك');
  const items = await getProductsByIds(ctx, r.product_ids as string[]);
  return {
    id: r.id,
    slug: r.slug,
    title: r.title_ar,
    subtitle: r.subtitle_ar,
    coverUrl: r.cover_url,
    items,
    totalPrice: items.reduce((s, p) => s + p.price, 0),
    storeCount: new Set(items.map((p) => p.store.id)).size,
  };
}
