import { randomBytes } from 'node:crypto';

import { requireUser, type Ctx } from '../../lib/context.js';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors.js';
import { quoteDelivery, type DeliveryQuote, type StoreEta } from '../delivery/delivery.js';
import { getCustomerCity } from '../users/users.service.js';

// ---------------------------------------------------------------- read model

/** Lines from either a user's cart or a shared-cart snapshot. */
type LineSource = { kind: 'cart'; userId: string } | { kind: 'shared'; sharedCartId: string };

const LINE_SELECT = `
  SELECT x.variant_id, x.quantity, v.sku, v.size, v.color_name_ar, v.color_hex, v.stock_qty,
         COALESCE(v.price, p.base_price) AS unit_price, p.currency,
         p.id AS product_id, p.name_ar, p.status AS product_status, c.slug AS category_slug,
         (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS image_url,
         s.id AS store_id, s.slug AS store_slug, s.name_ar AS store_name, s.logo_text, s.brand_color,
         s.city AS store_city, s.prep_hours, s.delivery_fee, s.status AS store_status`;

const LINE_JOINS = `
  JOIN product_variants v ON v.id = x.variant_id
  JOIN products p ON p.id = v.product_id
  JOIN stores s ON s.id = p.store_id
  LEFT JOIN categories c ON c.id = p.category_id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LineRow = Record<string, any>;

export async function loadLines(ctx: Ctx, source: LineSource, forUpdate = false): Promise<LineRow[]> {
  const sql =
    source.kind === 'cart'
      ? `${LINE_SELECT} FROM cart_items x ${LINE_JOINS} WHERE x.user_id = $1 ORDER BY s.name_ar, x.added_at`
      : `${LINE_SELECT} FROM shared_cart_items x ${LINE_JOINS} WHERE x.shared_cart_id = $1 ORDER BY s.name_ar, v.sku`;
  const { rows } = await ctx.db.query(
    forUpdate ? `${sql} FOR UPDATE OF v` : sql,
    [source.kind === 'cart' ? source.userId : source.sharedCartId],
  );
  return rows;
}

function lineIssue(r: LineRow): 'unavailable' | 'insufficient_stock' | null {
  if (r.product_status !== 'active' || r.store_status !== 'active') return 'unavailable';
  if (r.stock_qty < r.quantity) return 'insufficient_stock';
  return null;
}

export interface CartView {
  groups: Array<{
    store: { id: string; slug: string; name: string; logoText: string; brandColor: string | null; city: string };
    items: Array<{
      variantId: string;
      productId: string;
      name: string;
      imageUrl: string | null;
      colorHex: string | null;
      colorName: string | null;
      size: string | null;
      category: string | null;
      unitPrice: number;
      quantity: number;
      lineTotal: number;
      stock: number;
      issue: 'unavailable' | 'insufficient_stock' | null;
    }>;
    itemsCount: number;
    subtotal: number;
    /** This store's own parcel when the customer picks "أسرع توصيل". */
    fastestShipment: StoreEta | null;
  }>;
  itemsCount: number;
  storeCount: number;
  subtotal: number;
  currency: string;
  delivery: DeliveryQuote;
  totals: { fastest: number; unified: number };
  hasIssues: boolean;
}

export function buildCartView(rows: LineRow[], customerCity: string, ctx: Ctx): CartView {
  const groups = new Map<string, CartView['groups'][number] & { _store: LineRow }>();
  for (const r of rows) {
    let g = groups.get(r.store_id);
    if (!g) {
      g = {
        store: {
          id: r.store_id,
          slug: r.store_slug,
          name: r.store_name,
          logoText: r.logo_text ?? r.store_name,
          brandColor: r.brand_color,
          city: r.store_city,
        },
        items: [],
        itemsCount: 0,
        subtotal: 0,
        fastestShipment: null,
        _store: r,
      };
      groups.set(r.store_id, g);
    }
    const lineTotal = r.unit_price * r.quantity;
    g.items.push({
      variantId: r.variant_id,
      productId: r.product_id,
      name: r.name_ar,
      imageUrl: r.image_url,
      colorHex: r.color_hex,
      colorName: r.color_name_ar,
      size: r.size,
      category: r.category_slug,
      unitPrice: r.unit_price,
      quantity: r.quantity,
      lineTotal,
      stock: r.stock_qty,
      issue: lineIssue(r),
    });
    g.itemsCount += r.quantity;
    g.subtotal += lineTotal;
  }

  const list = [...groups.values()];
  const delivery = quoteDelivery(
    list.map((g) => ({
      storeId: g.store.id,
      city: g._store.store_city,
      prepHours: g._store.prep_hours,
      deliveryFee: g._store.delivery_fee,
    })),
    customerCity,
    ctx.now,
    ctx.config.delivery,
  );
  const etaByStore = new Map(delivery.fastest.perStore.map((e) => [e.storeId, e]));

  const subtotal = list.reduce((s, g) => s + g.subtotal, 0);
  return {
    groups: list.map(({ _store: _ignored, ...g }) => ({ ...g, fastestShipment: etaByStore.get(g.store.id) ?? null })),
    itemsCount: list.reduce((s, g) => s + g.itemsCount, 0),
    storeCount: list.length,
    subtotal,
    currency: (rows[0]?.currency as string | undefined) ?? ctx.config.currency,
    delivery,
    totals: { fastest: subtotal + delivery.fastest.fee, unified: subtotal + delivery.unified.fee },
    hasIssues: list.some((g) => g.items.some((i) => i.issue)),
  };
}

export async function getCart(ctx: Ctx): Promise<CartView> {
  const userId = requireUser(ctx);
  const [rows, city] = await Promise.all([loadLines(ctx, { kind: 'cart', userId }), getCustomerCity(ctx)]);
  return buildCartView(rows, city, ctx);
}

// ---------------------------------------------------------------- mutations

async function getVariantForCart(ctx: Ctx, variantId: string) {
  const { rows } = await ctx.db.query(
    `SELECT v.stock_qty, p.status AS product_status, s.status AS store_status
       FROM product_variants v JOIN products p ON p.id = v.product_id JOIN stores s ON s.id = p.store_id
      WHERE v.id = $1`,
    [variantId],
  );
  const v = rows[0];
  if (!v) throw notFound('المنتج');
  if (v.product_status !== 'active' || v.store_status !== 'active') {
    throw conflict('unavailable', 'هذا المنتج غير متاح حالياً');
  }
  return v as { stock_qty: number };
}

function assertStock(stock: number, wanted: number) {
  if (wanted > stock) {
    throw conflict(
      'insufficient_stock',
      stock === 0 ? 'نفدت الكمية' : `المتوفر ${stock} فقط`,
      { available: stock },
    );
  }
}

export async function addToCart(ctx: Ctx, variantId: string, quantity: number) {
  const userId = requireUser(ctx);
  const v = await getVariantForCart(ctx, variantId);
  const { rows } = await ctx.db.query<{ quantity: number }>(
    `SELECT quantity FROM cart_items WHERE user_id = $1 AND variant_id = $2`,
    [userId, variantId],
  );
  assertStock(v.stock_qty, (rows[0]?.quantity ?? 0) + quantity);
  await ctx.db.query(
    `INSERT INTO cart_items (user_id, variant_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, variant_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
    [userId, variantId, quantity],
  );
  return getCart(ctx);
}

export async function setCartQuantity(ctx: Ctx, variantId: string, quantity: number) {
  const userId = requireUser(ctx);
  if (quantity === 0) {
    await ctx.db.query(`DELETE FROM cart_items WHERE user_id = $1 AND variant_id = $2`, [userId, variantId]);
    return getCart(ctx);
  }
  const v = await getVariantForCart(ctx, variantId);
  assertStock(v.stock_qty, quantity);
  const { rowCount } = await ctx.db.query(
    `UPDATE cart_items SET quantity = $3 WHERE user_id = $1 AND variant_id = $2`,
    [userId, variantId, quantity],
  );
  if (rowCount === 0) throw notFound('المنتج في السلة');
  return getCart(ctx);
}

export async function clearCart(ctx: Ctx) {
  const userId = requireUser(ctx);
  await ctx.db.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);
  return getCart(ctx);
}

/**
 * Adds every piece of a look ("كمّل اللوك") to the cart.
 * `variants` lets the client pick sizes; otherwise the first in-stock variant is used.
 * Pieces already in the cart are left as they are.
 */
export async function addLookToCart(ctx: Ctx, lookId: string, variants: Record<string, string> = {}) {
  const userId = requireUser(ctx);
  const { rows } = await ctx.db.query(
    `SELECT li.product_id,
            (SELECT v.id FROM product_variants v
              WHERE v.product_id = li.product_id AND v.stock_qty > 0
              ORDER BY v.created_at, v.sku LIMIT 1) AS default_variant
       FROM look_items li JOIN looks l ON l.id = li.look_id AND l.is_active
       JOIN products p ON p.id = li.product_id AND p.status = 'active'
      WHERE l.id::text = $1 OR l.slug = $1
      ORDER BY li.position`,
    [lookId],
  );
  if (rows.length === 0) throw notFound('اللوك');

  const skipped: string[] = [];
  for (const r of rows) {
    const variantId = variants[r.product_id] ?? r.default_variant;
    if (!variantId) {
      skipped.push(r.product_id);
      continue;
    }
    await ctx.db.query(
      `INSERT INTO cart_items (user_id, variant_id, quantity)
       SELECT $1, v.id, 1 FROM product_variants v WHERE v.id = $2 AND v.product_id = $3 AND v.stock_qty > 0
       ON CONFLICT DO NOTHING`,
      [userId, variantId, r.product_id],
    );
  }
  return { cart: await getCart(ctx), skippedProductIds: skipped };
}

// ---------------------------------------------------------------- sharing

function newToken(): string {
  return randomBytes(9).toString('base64url'); // 12 URL-safe chars
}

export async function shareCart(ctx: Ctx) {
  const userId = requireUser(ctx);
  const count = await ctx.db.query(`SELECT count(*)::int AS n FROM cart_items WHERE user_id = $1`, [userId]);
  if (count.rows[0].n === 0) throw badRequest('cart_empty', 'السلة فارغة، أضيفي منتجات قبل المشاركة');

  const token = newToken();
  const { rows } = await ctx.db.query(
    `WITH sc AS (INSERT INTO shared_carts (token, owner_id) VALUES ($1, $2) RETURNING id, expires_at),
          ins AS (INSERT INTO shared_cart_items (shared_cart_id, variant_id, quantity)
                  SELECT sc.id, ci.variant_id, ci.quantity FROM sc, cart_items ci WHERE ci.user_id = $2)
     SELECT expires_at FROM sc`,
    [token, userId],
  );
  return {
    token,
    url: `${ctx.config.shareLinkBase}${token}`,
    expiresAt: (rows[0].expires_at as Date).toISOString(),
  };
}

async function findSharedCart(ctx: Ctx, token: string) {
  const { rows } = await ctx.db.query(
    `SELECT sc.id, sc.expires_at, sc.created_at, u.full_name
       FROM shared_carts sc JOIN users u ON u.id = sc.owner_id WHERE sc.token = $1`,
    [token],
  );
  const sc = rows[0];
  if (!sc) throw notFound('السلة المشتركة');
  if ((sc.expires_at as Date) <= ctx.now) throw new AppError(410, 'expired', 'انتهت صلاحية رابط السلة');
  return sc;
}

export async function getSharedCart(ctx: Ctx, token: string) {
  const sc = await findSharedCart(ctx, token);
  const [rows, city] = await Promise.all([
    loadLines(ctx, { kind: 'shared', sharedCartId: sc.id }),
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
export async function importSharedCart(ctx: Ctx, token: string) {
  const userId = requireUser(ctx);
  const sc = await findSharedCart(ctx, token);
  await ctx.db.query(
    `INSERT INTO cart_items (user_id, variant_id, quantity)
     SELECT $1, sci.variant_id, LEAST(sci.quantity, v.stock_qty)
       FROM shared_cart_items sci
       JOIN product_variants v ON v.id = sci.variant_id
       JOIN products p ON p.id = v.product_id AND p.status = 'active'
       JOIN stores s ON s.id = p.store_id AND s.status = 'active'
      WHERE sci.shared_cart_id = $2 AND v.stock_qty > 0
     ON CONFLICT (user_id, variant_id) DO UPDATE
       SET quantity = GREATEST(1, LEAST(cart_items.quantity + EXCLUDED.quantity,
                                        (SELECT stock_qty FROM product_variants WHERE id = EXCLUDED.variant_id)))`,
    [userId, sc.id],
  );
  return getCart(ctx);
}
