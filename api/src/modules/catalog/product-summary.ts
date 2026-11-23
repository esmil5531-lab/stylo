import type { Ctx } from '../../lib/context.js';
import { dayOffset, estimateArrival } from '../delivery/delivery.js';

/**
 * Shared SELECT for product cards. $1 must be the current user id (or NULL).
 * Callers append `AND …`, ORDER BY, LIMIT. Aliases: p = products, s = stores, c = categories.
 */
export const PRODUCT_SUMMARY_SELECT = `
  SELECT p.id, p.name_ar, p.brand, p.base_price, p.compare_at_price, p.currency,
         p.rating_avg, p.rating_count, p.sold_count, p.created_at,
         (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS image_url,
         (SELECT color_hex FROM product_variants v WHERE v.product_id = p.id ORDER BY v.created_at, v.sku LIMIT 1) AS color_hex,
         (SELECT COALESCE(SUM(stock_qty), 0) FROM product_variants v WHERE v.product_id = p.id) AS stock_total,
         s.id AS store_id, s.slug AS store_slug, s.name_ar AS store_name, s.city AS store_city, s.prep_hours,
         c.slug AS category_slug,
         EXISTS (SELECT 1 FROM wishlist_items w WHERE w.user_id = $1::uuid AND w.product_id = p.id) AS is_wishlisted
    FROM products p
    JOIN stores s ON s.id = p.store_id AND s.status = 'active'
    LEFT JOIN categories c ON c.id = p.category_id
   WHERE p.status = 'active'`;

export interface ProductSummary {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  rating: number;
  ratingCount: number;
  imageUrl: string | null;
  colorHex: string | null;
  category: string | null;
  inStock: boolean;
  isWishlisted: boolean;
  store: { id: string; slug: string; name: string; city: string };
  delivery: { arrivesAt: string; dayOffset: number };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProductSummary(r: any, ctx: Ctx, customerCity: string): ProductSummary {
  const at = estimateArrival(ctx.now, r.prep_hours, r.store_city, customerCity, ctx.config.delivery);
  return {
    id: r.id,
    name: r.name_ar,
    brand: r.brand,
    price: r.base_price,
    compareAtPrice: r.compare_at_price,
    currency: r.currency,
    rating: r.rating_avg,
    ratingCount: r.rating_count,
    imageUrl: r.image_url,
    colorHex: r.color_hex,
    category: r.category_slug,
    inStock: r.stock_total > 0,
    isWishlisted: r.is_wishlisted,
    store: { id: r.store_id, slug: r.store_slug, name: r.store_name, city: r.store_city },
    delivery: { arrivesAt: at.toISOString(), dayOffset: dayOffset(ctx.now, at) },
  };
}
