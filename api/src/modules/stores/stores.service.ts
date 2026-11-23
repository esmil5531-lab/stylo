import type { Ctx } from '../../lib/context.js';
import { notFound } from '../../lib/errors.js';
import { listProducts } from '../catalog/catalog.service.js';

const STORE_COLUMNS = `s.id, s.slug, s.name_ar, s.name_en, s.description_ar, s.logo_url, s.cover_url,
  s.logo_text, s.brand_color, s.city, s.prep_hours, s.delivery_fee, s.rating_avg, s.rating_count, s.is_featured`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapStore(r: any) {
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name_ar as string,
    nameEn: r.name_en as string | null,
    description: r.description_ar as string | null,
    logoUrl: r.logo_url as string | null,
    coverUrl: r.cover_url as string | null,
    logoText: (r.logo_text ?? r.name_en ?? r.name_ar) as string,
    brandColor: r.brand_color as string | null,
    city: r.city as string,
    prepHours: r.prep_hours as number,
    deliveryFee: r.delivery_fee as number,
    rating: r.rating_avg as number,
    ratingCount: r.rating_count as number,
    isFeatured: r.is_featured as boolean,
  };
}

export type Store = ReturnType<typeof mapStore>;

export async function listStores(ctx: Ctx, opts: { featured?: boolean; limit: number }) {
  const { rows } = await ctx.db.query(
    `SELECT ${STORE_COLUMNS} FROM stores s
      WHERE s.status = 'active' ${opts.featured ? 'AND s.is_featured' : ''}
      ORDER BY s.is_featured DESC, s.rating_avg DESC, s.name_ar
      LIMIT $1`,
    [opts.limit],
  );
  return rows.map(mapStore);
}

export async function getStore(ctx: Ctx, slug: string) {
  const { rows } = await ctx.db.query(
    `SELECT ${STORE_COLUMNS} FROM stores s WHERE s.slug = $1 AND s.status = 'active'`,
    [slug],
  );
  if (!rows[0]) throw notFound('المتجر');
  const products = await listProducts(ctx, { store: slug, feed: 'for_you', limit: 50, offset: 0 });
  return { ...mapStore(rows[0]), products };
}
