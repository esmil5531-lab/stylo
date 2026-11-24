import { randomBytes } from 'node:crypto';

import { inTransaction, type Queryable } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { assertCategoryUsable } from './categories.admin.js';
import type { StaffContext } from './permissions.js';

/**
 * Catalog management for the back office. Store staff only ever touch their own store's products.
 * A product's sizes/colours are its variants: one row per (size, colour), each with its own stock
 * and optional price override. Money is in LYD dirhams.
 */

export const PRODUCT_STATUSES = ['draft', 'active', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export interface VariantInput {
  id?: string;
  size?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  sku?: string | null;
  /** Overrides the product price for this variant; null = product price. */
  price?: number | null;
  stock: number;
}

export interface ProductInput {
  storeId?: string;
  categoryId?: string | null;
  nameAr: string;
  nameEn?: string | null;
  brand?: string | null;
  descriptionAr?: string | null;
  basePrice: number;
  compareAtPrice?: number | null;
  status: ProductStatus;
  isFeatured?: boolean;
  images: string[];
  variants: VariantInput[];
}

/** Which store a staff member may act on: their own, or the requested one for platform staff. */
function resolveStoreId(staff: StaffContext, requested?: string): string {
  if (staff.storeId) {
    if (requested && requested !== staff.storeId) throw forbidden('يمكنك إدارة منتجات متجرك فقط');
    return staff.storeId;
  }
  if (!requested) throw badRequest('store_required', 'اختاري المتجر');
  return requested;
}

const LIST_SELECT = `
  SELECT p.id, p.name_ar, p.name_en, p.brand, p.base_price, p.compare_at_price, p.currency, p.status,
         p.is_featured, p.sold_count, p.rating_avg, p.updated_at,
         s.id AS store_id, s.name_ar AS store_name, c.id AS category_id, c.name_ar AS category_name,
         (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS image_url,
         (SELECT COALESCE(SUM(stock_qty), 0)::int FROM product_variants v WHERE v.product_id = p.id) AS stock_total,
         (SELECT count(*)::int FROM product_variants v WHERE v.product_id = p.id) AS variants_count,
         (SELECT count(*)::int FROM product_variants v WHERE v.product_id = p.id AND v.stock_qty = 0) AS sold_out_variants,
         (SELECT array_agg(DISTINCT v.size) FILTER (WHERE v.size IS NOT NULL)
            FROM product_variants v WHERE v.product_id = p.id) AS sizes,
         (SELECT color_hex FROM product_variants v WHERE v.product_id = p.id ORDER BY v.position LIMIT 1) AS color_hex
    FROM products p
    JOIN stores s ON s.id = p.store_id
    LEFT JOIN categories c ON c.id = p.category_id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapListRow(r: any) {
  return {
    id: r.id as string,
    nameAr: r.name_ar as string,
    nameEn: r.name_en as string | null,
    brand: r.brand as string | null,
    basePrice: r.base_price as number,
    compareAtPrice: r.compare_at_price as number | null,
    currency: r.currency as string,
    status: r.status as ProductStatus,
    isFeatured: r.is_featured as boolean,
    soldCount: r.sold_count as number,
    rating: r.rating_avg as number,
    updatedAt: (r.updated_at as Date).toISOString(),
    store: { id: r.store_id as string, name: r.store_name as string },
    category: r.category_id ? { id: r.category_id as string, name: r.category_name as string } : null,
    imageUrl: r.image_url as string | null,
    colorHex: r.color_hex as string | null,
    stockTotal: r.stock_total as number,
    variantsCount: r.variants_count as number,
    soldOutVariants: r.sold_out_variants as number,
    sizes: (r.sizes as string[] | null) ?? [],
  };
}

export async function listProducts(
  ctx: Ctx,
  staff: StaffContext,
  q: { status?: ProductStatus; storeId?: string; categoryId?: string; search?: string; lowStock?: boolean },
) {
  const params: unknown[] = [];
  const where = ['TRUE'];
  if (staff.storeId) where.push(`p.store_id = $${params.push(staff.storeId)}`);
  else if (q.storeId) where.push(`p.store_id = $${params.push(q.storeId)}`);
  if (q.status) where.push(`p.status = $${params.push(q.status)}`);
  if (q.categoryId) where.push(`p.category_id = $${params.push(q.categoryId)}`);
  if (q.lowStock) {
    where.push(`EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.stock_qty <= 2)`);
  }
  if (q.search) {
    const like = `$${params.push(`%${q.search.replace(/[\\%_]/g, (m) => '\\' + m)}%`)}`;
    where.push(`(p.name_ar ILIKE ${like} OR p.name_en ILIKE ${like} OR p.brand ILIKE ${like}
                 OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.sku ILIKE ${like}))`);
  }
  const { rows } = await ctx.db.query(
    `${LIST_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC LIMIT 200`,
    params,
  );
  return rows.map(mapListRow);
}

async function findScopedProduct(db: Queryable, staff: StaffContext, id: string) {
  const { rows } = await db.query(`SELECT id, store_id, category_id FROM products WHERE id = $1`, [id]);
  const p = rows[0];
  if (!p || (staff.storeId && p.store_id !== staff.storeId)) throw notFound('المنتج');
  return p as { id: string; store_id: string; category_id: string | null };
}

export async function getProduct(ctx: Ctx, staff: StaffContext, id: string) {
  await findScopedProduct(ctx.db, staff, id);
  const [base, variants, images, details] = await Promise.all([
    ctx.db.query(`${LIST_SELECT} WHERE p.id = $1`, [id]),
    ctx.db.query(
      `SELECT v.id, v.size, v.color_name_ar, v.color_hex, v.sku, v.price, v.stock_qty, v.position,
              (SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_items oi
                 JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
                WHERE oi.variant_id = v.id) AS sold
         FROM product_variants v WHERE v.product_id = $1 ORDER BY v.position, v.sku`,
      [id],
    ),
    ctx.db.query(`SELECT url FROM product_images WHERE product_id = $1 ORDER BY sort_order`, [id]),
    ctx.db.query(`SELECT description_ar FROM products WHERE id = $1`, [id]),
  ]);
  return {
    ...mapListRow(base.rows[0]),
    descriptionAr: details.rows[0]?.description_ar as string | null,
    images: images.rows.map((r) => r.url as string),
    variants: variants.rows.map((r) => ({
      id: r.id as string,
      size: r.size as string | null,
      colorName: r.color_name_ar as string | null,
      colorHex: r.color_hex as string | null,
      sku: r.sku as string,
      price: r.price as number | null,
      stock: r.stock_qty as number,
      position: r.position as number,
      sold: r.sold as number,
    })),
  };
}

// ---------------------------------------------------------------- validation shared by create/update

function normaliseVariants(input: VariantInput[]): VariantInput[] {
  if (input.length === 0) throw badRequest('variants_required', 'أضيفي مقاساً أو لوناً واحداً على الأقل مع الكمية');
  const seen = new Set<string>();
  return input.map((v) => {
    const size = v.size?.trim() || null;
    const colorName = v.colorName?.trim() || null;
    const key = `${size ?? ''}|${colorName ?? ''}`;
    if (seen.has(key)) {
      throw badRequest(
        'duplicate_variant',
        `المقاس «${size ?? 'بدون مقاس'}»${colorName ? ` باللون «${colorName}»` : ''} مكرر`,
      );
    }
    seen.add(key);
    return { ...v, size, colorName, sku: v.sku?.trim().toUpperCase() || null };
  });
}

function checkPrices(basePrice: number, compareAtPrice?: number | null) {
  if (compareAtPrice != null && compareAtPrice <= basePrice) {
    throw badRequest('invalid_compare_price', 'السعر قبل الخصم يجب أن يكون أعلى من سعر البيع');
  }
}

async function skuPrefix(db: Queryable, storeId: string): Promise<string> {
  const { rows } = await db.query(`SELECT slug FROM stores WHERE id = $1`, [storeId]);
  if (!rows[0]) throw notFound('المتجر');
  return (rows[0].slug as string).replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || 'STY';
}

/** Writes variants: updates by id, inserts new ones, deletes the ones no longer listed. */
async function saveVariants(db: Queryable, productId: string, storeId: string, variants: VariantInput[]) {
  const existing = await db.query<{ id: string }>(`SELECT id FROM product_variants WHERE product_id = $1`, [productId]);
  const existingIds = new Set(existing.rows.map((r) => r.id));
  const keep = new Set(variants.map((v) => v.id).filter((id): id is string => !!id && existingIds.has(id)));
  const removed = [...existingIds].filter((id) => !keep.has(id));
  // Past orders keep their snapshot (order_items.variant_id becomes NULL).
  if (removed.length) await db.query(`DELETE FROM product_variants WHERE id = ANY($1::uuid[])`, [removed]);

  const prefix = await skuPrefix(db, storeId);
  for (const [i, v] of variants.entries()) {
    const sku = v.sku ?? `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;
    if (v.id && keep.has(v.id)) {
      await db.query(
        `UPDATE product_variants SET size = $2, color_name_ar = $3, color_hex = $4, sku = $5, price = $6,
                stock_qty = $7, position = $8
          WHERE id = $1 AND product_id = $9`,
        [v.id, v.size, v.colorName, v.colorHex ?? null, sku, v.price ?? null, v.stock, i + 1, productId],
      );
    } else {
      await db.query(
        `INSERT INTO product_variants (product_id, size, color_name_ar, color_hex, sku, price, stock_qty, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [productId, v.size, v.colorName, v.colorHex ?? null, sku, v.price ?? null, v.stock, i + 1],
      );
    }
  }
}

async function saveImages(db: Queryable, productId: string, images: string[]) {
  await db.query(`DELETE FROM product_images WHERE product_id = $1`, [productId]);
  for (const [i, url] of images.entries()) {
    await db.query(`INSERT INTO product_images (product_id, url, sort_order) VALUES ($1, $2, $3)`, [productId, url, i]);
  }
}

function productSlug(nameEn?: string | null): string {
  const base = (nameEn ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'product'}-${randomBytes(3).toString('hex')}`;
}

export async function createProduct(ctx: Ctx, staff: StaffContext, input: ProductInput) {
  const storeId = resolveStoreId(staff, input.storeId);
  checkPrices(input.basePrice, input.compareAtPrice);
  const variants = normaliseVariants(input.variants);
  // Only Stylo staff decide what is featured on the home screen.
  const isFeatured = staff.storeId ? false : (input.isFeatured ?? false);

  const id = await inTransaction(ctx.db, async (db) => {
    await assertCategoryUsable(db, input.categoryId);
    const { rows } = await db.query(
      `INSERT INTO products (store_id, category_id, slug, name_ar, name_en, brand, description_ar,
                             base_price, compare_at_price, status, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        storeId,
        input.categoryId ?? null,
        productSlug(input.nameEn),
        input.nameAr.trim(),
        input.nameEn?.trim() || null,
        input.brand?.trim() || null,
        input.descriptionAr?.trim() || null,
        input.basePrice,
        input.compareAtPrice ?? null,
        input.status,
        isFeatured,
      ],
    );
    const productId = rows[0].id as string;
    await saveVariants(db, productId, storeId, variants);
    await saveImages(db, productId, input.images);
    return productId;
  });
  return getProduct(ctx, staff, id);
}

export async function updateProduct(ctx: Ctx, staff: StaffContext, id: string, input: ProductInput) {
  checkPrices(input.basePrice, input.compareAtPrice);
  const variants = normaliseVariants(input.variants);
  await inTransaction(ctx.db, async (db) => {
    const current = await findScopedProduct(db, staff, id);
    if (input.storeId && input.storeId !== current.store_id) {
      throw badRequest('store_change', 'لا يمكن نقل منتج إلى متجر آخر');
    }
    await assertCategoryUsable(db, input.categoryId, current.category_id);
    await db.query(
      `UPDATE products SET category_id = $2, name_ar = $3, name_en = $4, brand = $5, description_ar = $6,
              base_price = $7, compare_at_price = $8, status = $9,
              is_featured = CASE WHEN $10::boolean IS NULL THEN is_featured ELSE $10::boolean END
        WHERE id = $1`,
      [
        id,
        input.categoryId ?? null,
        input.nameAr.trim(),
        input.nameEn?.trim() || null,
        input.brand?.trim() || null,
        input.descriptionAr?.trim() || null,
        input.basePrice,
        input.compareAtPrice ?? null,
        input.status,
        staff.storeId ? null : (input.isFeatured ?? null),
      ],
    );
    await saveVariants(db, id, current.store_id, variants);
    await saveImages(db, id, input.images);
  });
  return getProduct(ctx, staff, id);
}
