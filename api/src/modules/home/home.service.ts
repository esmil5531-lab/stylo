import type { Ctx } from '../../lib/context.js';
import { listLooks } from '../looks/looks.service.js';
import { listStores } from '../stores/stores.service.js';

/** Everything on the home screen except the product feed (which is paged per tab via /products). */
export async function getHome(ctx: Ctx) {
  const [banners, looks, stores] = await Promise.all([
    ctx.db.query(
      `SELECT id, title_ar, subtitle_ar, cta_ar, image_url, link FROM banners
        WHERE is_active AND (starts_at IS NULL OR starts_at <= $1) AND (ends_at IS NULL OR ends_at > $1)
        ORDER BY sort_order LIMIT 5`,
      [ctx.now],
    ),
    listLooks(ctx, { featured: true, limit: 1 }),
    listStores(ctx, { featured: true, limit: 10 }),
  ]);

  return {
    banners: banners.rows.map((r) => ({
      id: r.id as string,
      title: r.title_ar as string,
      subtitle: r.subtitle_ar as string | null,
      cta: r.cta_ar as string | null,
      imageUrl: r.image_url as string | null,
      link: r.link as string | null,
    })),
    featuredLook: looks[0] ?? null,
    featuredStores: stores,
  };
}
