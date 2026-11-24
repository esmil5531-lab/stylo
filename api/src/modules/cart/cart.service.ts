import { mediaVariant } from '../../lib/media.js';
import { randomBytes } from 'node:crypto';

import { inTransaction, type Queryable } from '../../db.js';
import { requireUser, type Ctx } from '../../lib/context.js';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors.js';
import { quoteDelivery, type DeliveryQuote } from '../delivery/delivery.js';
import { getCustomerCity } from '../users/users.service.js';

/**
 * One cart per user, bound to ONE store (table `carts`, migration 0003).
 * Adding something from another store answers 409 `cart_store_conflict`; the client then
 * asks the customer and repeats the call with `replaceCart: true` to start a new cart.
 */

// ---------------------------------------------------------------- read model

type LineSource = { kind: 'cart'; userId: string } | { kind: 'shared'; sharedCartId: string };

const LINE_SELECT = `
  SELECT x.variant_id, x.quantity, v.sku, v.size, v.color_name_ar, v.color_hex, v.stock_qty,
         COALESCE(v.price, p.base_price) AS unit_price, p.currency,
         p.id AS product_id, p.name_ar, p.status AS product_status,
         COALESCE(pc.slug, c.slug) AS category_slug, COALESCE(c.icon, pc.icon) AS category_icon,
         (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS image_url,
         s.id AS store_id, s.slug AS store_slug, s.name_ar AS store_name, s.logo_text, s.brand_color,
         s.city AS store_city, s.prep_hours, s.delivery_fee, s.status AS store_status`;

const LINE_JOINS = `
  JOIN product_variants v ON v.id = x.variant_id
  JOIN products p ON p.id = v.product_id
  JOIN stores s ON s.id = p.store_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LineRow = Record<string, any>;

export async function loadLines(db: Queryable, source: LineSource, forUpdate = false): Promise<LineRow[]> {
  const sql =
    source.kind === 'cart'
      ? `${LINE_SELECT} FROM cart_items x ${LINE_JOINS} WHERE x.user_id = $1 ORDER BY x.added_at, v.sku`
      : `${LINE_SELECT} FROM shared_cart_items x ${LINE_JOINS} WHERE x.shared_cart_id = $1 ORDER BY v.sku`;
  const { rows } = await db.query(forUpdate ? `${sql} FOR UPDATE OF v` : sql, [
    source.kind === 'cart' ? source.userId : source.sharedCartId,
  ]);
  return rows;
}

function lineIssue(r: LineRow): 'unavailable' | 'insufficient_stock' | null {
  if (r.product_status !== 'active' || r.store_status !== 'active') return 'unavailable';
  if (r.stock_qty < r.quantity) return 'insufficient_stock';
  return null;
}

export interface CartStore {
  id: string;
  slug: string;
  name: string;
  logoText: string;
  brandColor: string | null;
  city: string;
}

export interface CartItem {
  variantId: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  colorHex: string | null;
  colorName: string | null;
  size: string | null;
  category: string | null;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  stock: number;
  issue: 'unavailable' | 'insufficient_stock' | null;
}

export interface CartView {
  /** The single store this cart belongs to; null when empty. */
  store: CartStore | null;
  items: CartItem[];
  itemsCount: number;
  subtotal: number;
  currency: string;
  /** «أسرع توصيل» / «توصيل عادي» for this store; null when empty. */
  delivery: DeliveryQuote | null;
  totals: { fastest: number; standard: number } | null;
  hasIssues: boolean;
}

export function buildCartView(rows: LineRow[], customerCity: string, ctx: Ctx): CartView {
  const first = rows[0];
  if (!first) {
    return {
      store: null,
      items: [],
      itemsCount: 0,
      subtotal: 0,
      currency: ctx.config.currency,
      delivery: null,
      totals: null,
      hasIssues: false,
    };
  }

  const items: CartItem[] = rows.map((r) => ({
    variantId: r.variant_id,
    productId: r.product_id,
    name: r.name_ar,
    imageUrl: mediaVariant(r.image_url, 800),
    colorHex: r.color_hex,
    colorName: r.color_name_ar,
    size: r.size,
    category: r.category_slug,
    categoryIcon: r.category_icon ?? null,
    sku: r.sku,
    unitPrice: r.unit_price,
    quantity: r.quantity,
    lineTotal: r.unit_price * r.quantity,
    stock: r.stock_qty,
    issue: lineIssue(r),
  }));
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const delivery = quoteDelivery(
    { city: first.store_city, prepHours: first.prep_hours, deliveryFee: first.delivery_fee },
    customerCity,
    ctx.now,
    ctx.config.delivery,
  );

  return {
    store: {
      id: first.store_id,
      slug: first.store_slug,
      name: first.store_name,
      logoText: first.logo_text ?? first.store_name,
      brandColor: first.brand_color,
      city: first.store_city,
    },
    items,
    itemsCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotal,
    currency: first.currency,
    delivery,
    totals: { fastest: subtotal + delivery.fastest.fee, standard: subtotal + delivery.standard.fee },
    hasIssues: items.some((i) => i.issue),
  };
}

export async function getCart(ctx: Ctx): Promise<CartView> {
  const userId = requireUser(ctx);
  const [rows, city] = await Promise.all([loadLines(ctx.db, { kind: 'cart', userId }), getCustomerCity(ctx)]);
  return buildCartView(rows, city, ctx);
}

// ---------------------------------------------------------------- single-store guard

interface StoreRef {
  id: string;
  slug: string;
  name: string;
}

/**
 * Makes sure the user's cart belongs to `store`. Creates the cart if there is none.
 * If it belongs to another store: throws `cart_store_conflict`, or — with `replace` —
 * empties it and rebinds it to the new store. Must run inside a transaction.
 */
async function bindCartToStore(db: Queryable, userId: string, store: StoreRef, replace: boolean) {
  const { rows } = await db.query(
    `SELECT c.store_id, s.slug, s.name_ar,
            (SELECT COALESCE(SUM(quantity), 0)::int FROM cart_items WHERE user_id = c.user_id) AS items_count
       FROM carts c JOIN stores s ON s.id = c.store_id
      WHERE c.user_id = $1
      FOR UPDATE OF c`,
    [userId],
  );
  const current = rows[0];

  if (current && current.store_id !== store.id) {
    if (!replace) {
      throw conflict(
        'cart_store_conflict',
        `سلتك الحالية من «${current.name_ar}». الطلب في ستايلو يكون من متجر واحد في كل مرة`,
        {
          currentStore: { id: current.store_id, slug: current.slug, name: current.name_ar },
          requestedStore: store,
          itemsCount: current.items_count,
        },
      );
    }
    await db.query(`DELETE FROM carts WHERE user_id = $1`, [userId]); // cascades to cart_items
  }
  if (!current || current.store_id !== store.id) {
    await db.query(`INSERT INTO carts (user_id, store_id) VALUES ($1, $2)`, [userId, store.id]);
  } else {
    await db.query(`UPDATE carts SET updated_at = now() WHERE user_id = $1`, [userId]);
  }
}

// ---------------------------------------------------------------- mutations

async function getVariantForCart(db: Queryable, variantId: string) {
  const { rows } = await db.query(
    `SELECT v.stock_qty, p.status AS product_status, s.status AS store_status,
            s.id AS store_id, s.slug AS store_slug, s.name_ar AS store_name
       FROM product_variants v JOIN products p ON p.id = v.product_id JOIN stores s ON s.id = p.store_id
      WHERE v.id = $1`,
    [variantId],
  );
  const v = rows[0];
  if (!v) throw notFound('المنتج');
  if (v.product_status !== 'active' || v.store_status !== 'active') {
    throw conflict('unavailable', 'هذا المنتج غير متاح حالياً');
  }
  return {
    stock: v.stock_qty as number,
    store: { id: v.store_id as string, slug: v.store_slug as string, name: v.store_name as string },
  };
}

function assertStock(stock: number, wanted: number) {
  if (wanted > stock) {
    throw conflict('insufficient_stock', stock === 0 ? 'نفدت الكمية' : `المتوفر ${stock} فقط`, {
      available: stock,
    });
  }
}

export async function addToCart(ctx: Ctx, variantId: string, quantity: number, replaceCart = false) {
  const userId = requireUser(ctx);
  await inTransaction(ctx.db, async (db) => {
    const v = await getVariantForCart(db, variantId);
    await bindCartToStore(db, userId, v.store, replaceCart);
    const { rows } = await db.query<{ quantity: number }>(
      `SELECT quantity FROM cart_items WHERE user_id = $1 AND variant_id = $2`,
      [userId, variantId],
    );
    assertStock(v.stock, (rows[0]?.quantity ?? 0) + quantity);
    await db.query(
      `INSERT INTO cart_items (user_id, variant_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, variant_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
      [userId, variantId, quantity],
    );
  });
  return getCart(ctx);
}

export async function setCartQuantity(ctx: Ctx, variantId: string, quantity: number) {
  const userId = requireUser(ctx);
  if (quantity === 0) {
    // The empty cart row (and its store binding) is dropped by trigger.
    await ctx.db.query(`DELETE FROM cart_items WHERE user_id = $1 AND variant_id = $2`, [userId, variantId]);
    return getCart(ctx);
  }
  const v = await getVariantForCart(ctx.db, variantId);
  assertStock(v.stock, quantity);
  const { rowCount } = await ctx.db.query(
    `UPDATE cart_items SET quantity = $3 WHERE user_id = $1 AND variant_id = $2`,
    [userId, variantId, quantity],
  );
  if (rowCount === 0) throw notFound('المنتج في السلة');
  return getCart(ctx);
}

export async function clearCart(ctx: Ctx) {
  const userId = requireUser(ctx);
  await ctx.db.query(`DELETE FROM carts WHERE user_id = $1`, [userId]);
  return getCart(ctx);
}

/**
 * Adds every piece of a look ("كمّل اللوك") to the cart. Looks belong to one store, so the
 * same single-store rule applies. `variants` picks sizes; otherwise the first in-stock variant.
 * Pieces already in the cart are left as they are.
 */
export async function addLookToCart(
  ctx: Ctx,
  lookId: string,
  variants: Record<string, string> = {},
  replaceCart = false,
) {
  const userId = requireUser(ctx);
  const skipped: string[] = [];

  await inTransaction(ctx.db, async (db) => {
    const { rows } = await db.query(
      `SELECT li.product_id, s.id AS store_id, s.slug AS store_slug, s.name_ar AS store_name,
              (SELECT v.id FROM product_variants v
                WHERE v.product_id = li.product_id AND v.stock_qty > 0
                ORDER BY v.position, v.sku LIMIT 1) AS default_variant
         FROM looks l
         JOIN stores s ON s.id = l.store_id AND s.status = 'active'
         JOIN look_items li ON li.look_id = l.id
         JOIN products p ON p.id = li.product_id AND p.status = 'active'
        WHERE l.is_active AND (l.id::text = $1 OR l.slug = $1)
        ORDER BY li.position`,
      [lookId],
    );
    const first = rows[0];
    if (!first) throw notFound('اللوك');

    await bindCartToStore(
      db,
      userId,
      { id: first.store_id, slug: first.store_slug, name: first.store_name },
      replaceCart,
    );
    for (const r of rows) {
      const variantId = variants[r.product_id] ?? r.default_variant;
      if (!variantId) {
        skipped.push(r.product_id);
        continue;
      }
      await db.query(
        `INSERT INTO cart_items (user_id, variant_id, quantity)
         SELECT $1, v.id, 1 FROM product_variants v WHERE v.id = $2 AND v.product_id = $3 AND v.stock_qty > 0
         ON CONFLICT DO NOTHING`,
        [userId, variantId, r.product_id],
      );
    }
  });
  return { cart: await getCart(ctx), skippedProductIds: skipped };
}

// ---------------------------------------------------------------- sharing

function newToken(): string {
  return randomBytes(9).toString('base64url'); // 12 URL-safe chars
}

export async function shareCart(ctx: Ctx) {
  const userId = requireUser(ctx);
  const cart = await ctx.db.query<{ store_id: string }>(`SELECT store_id FROM carts WHERE user_id = $1`, [userId]);
  const storeId = cart.rows[0]?.store_id;
  if (!storeId) throw badRequest('cart_empty', 'السلة فارغة، أضيفي منتجات قبل المشاركة');

  const token = newToken();
  const { rows } = await ctx.db.query(
    `WITH sc AS (INSERT INTO shared_carts (token, owner_id, store_id) VALUES ($1, $2, $3) RETURNING id, expires_at),
          ins AS (INSERT INTO shared_cart_items (shared_cart_id, variant_id, quantity)
                  SELECT sc.id, ci.variant_id, ci.quantity FROM sc, cart_items ci WHERE ci.user_id = $2)
     SELECT expires_at FROM sc`,
    [token, userId, storeId],
  );
  return {
    token,
    url: `${ctx.config.shareLinkBase}${token}`,
    expiresAt: (rows[0].expires_at as Date).toISOString(),
  };
}

async function findSharedCart(db: Queryable, token: string, now: Date) {
  const { rows } = await db.query(
    `SELECT sc.id, sc.expires_at, sc.created_at, u.full_name,
            s.id AS store_id, s.slug AS store_slug, s.name_ar AS store_name
       FROM shared_carts sc
       JOIN users u ON u.id = sc.owner_id
       JOIN stores s ON s.id = sc.store_id
      WHERE sc.token = $1`,
    [token],
  );
  const sc = rows[0];
  if (!sc) throw notFound('السلة المشتركة');
  if ((sc.expires_at as Date) <= now) throw new AppError(410, 'expired', 'انتهت صلاحية رابط السلة');
  return sc;
}

export async function getSharedCart(ctx: Ctx, token: string) {
  const sc = await findSharedCart(ctx.db, token, ctx.now);
  const [rows, city] = await Promise.all([
    loadLines(ctx.db, { kind: 'shared', sharedCartId: sc.id }),
    getCustomerCity(ctx),
  ]);
  return {
    token,
    // Only the first name is exposed to whoever opens the link.
    sharedBy: String(sc.full_name).split(' ')[0],
    createdAt: (sc.created_at as Date).toISOString(),
    expiresAt: (sc.expires_at as Date).toISOString(),
    cart: buildCartView(rows, city, ctx),
  };
}

/** Copies a shared cart into the current user's cart (quantities capped by stock). */
export async function importSharedCart(ctx: Ctx, token: string, replaceCart = false) {
  const userId = requireUser(ctx);
  await inTransaction(ctx.db, async (db) => {
    const sc = await findSharedCart(db, token, ctx.now);
    await bindCartToStore(db, userId, { id: sc.store_id, slug: sc.store_slug, name: sc.store_name }, replaceCart);
    await db.query(
      `INSERT INTO cart_items (user_id, variant_id, quantity)
       SELECT $1, sci.variant_id, LEAST(sci.quantity, v.stock_qty)
         FROM shared_cart_items sci
         JOIN product_variants v ON v.id = sci.variant_id
         JOIN products p ON p.id = v.product_id AND p.status = 'active'
        WHERE sci.shared_cart_id = $2 AND v.stock_qty > 0
       ON CONFLICT (user_id, variant_id) DO UPDATE
         SET quantity = GREATEST(1, LEAST(cart_items.quantity + EXCLUDED.quantity,
                                          (SELECT stock_qty FROM product_variants WHERE id = EXCLUDED.variant_id)))`,
      [userId, sc.id],
    );
    // Everything was out of stock: don't leave an empty cart bound to the store.
    await db.query(
      `DELETE FROM carts c WHERE c.user_id = $1 AND NOT EXISTS (SELECT 1 FROM cart_items WHERE user_id = $1)`,
      [userId],
    );
  });
  return getCart(ctx);
}
