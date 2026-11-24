import { randomBytes } from 'node:crypto';

import { inTransaction, type Queryable } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { badRequest, notFound } from '../../lib/errors.js';
import type { StaffContext } from './permissions.js';

/**
 * «كمّل اللوك» in the back office. A look belongs to ONE store (trigger look_single_store), so the
 * whole look fits one cart. Store staff manage their own store's looks; Stylo staff manage all and
 * alone decide which look is featured on the home screen (is_featured), like featured products.
 * Customers only see a look while it is shown and at least 2 of its pieces are on sale.
 */

export const LOOK_MIN_ITEMS = 2;
export const LOOK_MAX_ITEMS = 8;

export interface LookInput {
  storeId?: string;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  isActive?: boolean;
  isFeatured?: boolean;
  productIds: string[];
}

const LIST_SELECT = `
  SELECT l.id, l.slug, l.title_ar, l.subtitle_ar, l.cover_url, l.is_active, l.is_featured, l.sort_order,
         l.updated_at, s.id AS store_id, s.name_ar AS store_name, s.status AS store_status,
         count(li.product_id)::int AS items_count,
         count(p.id) FILTER (WHERE p.status = 'active')::int AS visible_items,
         COALESCE(SUM(p.base_price) FILTER (WHERE p.status = 'active'), 0)::bigint AS total_price
    FROM looks l
    JOIN stores s ON s.id = l.store_id
    LEFT JOIN look_items li ON li.look_id = l.id
    LEFT JOIN products p ON p.id = li.product_id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any) {
  const visible = r.is_active && r.store_status === 'active' && r.visible_items >= LOOK_MIN_ITEMS;
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title_ar as string,
    subtitle: r.subtitle_ar as string | null,
    coverUrl: r.cover_url as string | null,
    isActive: r.is_active as boolean,
    isFeatured: r.is_featured as boolean,
    sortOrder: r.sort_order as number,
    updatedAt: (r.updated_at as Date).toISOString(),
    store: { id: r.store_id as string, name: r.store_name as string },
    itemsCount: r.items_count as number,
    visibleItems: r.visible_items as number,
    totalPrice: Number(r.total_price),
    /** Seen by customers right now (shown, store active, ≥ 2 pieces on sale). */
    visibleToCustomers: visible,
    /** Why it is not visible, for the back office. */
    hiddenReason: visible
      ? null
      : !r.is_active
        ? 'مخفي'
        : r.store_status !== 'active'
          ? 'المتجر غير نشط'
          : `أقل من ${LOOK_MIN_ITEMS} قطع متاحة`,
  };
}

function scope(staff: StaffContext, params: unknown[]): string {
  return staff.storeId ? `l.store_id = $${params.push(staff.storeId)}` : 'TRUE';
}

export async function listAdminLooks(ctx: Ctx, staff: StaffContext, q: { storeId?: string } = {}) {
  const params: unknown[] = [];
  const where = [scope(staff, params)];
  if (q.storeId && !staff.storeId) where.push(`l.store_id = $${params.push(q.storeId)}`);
  const { rows } = await ctx.db.query(
    `${LIST_SELECT} WHERE ${where.join(' AND ')}
      GROUP BY l.id, s.id ORDER BY l.is_featured DESC, l.sort_order, l.created_at DESC`,
    params,
  );
  return rows.map(mapRow);
}

async function findScoped(db: Queryable, staff: StaffContext, id: string, lock = false) {
  const params: unknown[] = [id];
  const { rows } = await db.query(
    `SELECT l.id, l.store_id FROM looks l WHERE l.id = $1 AND ${scope(staff, params)} ${lock ? 'FOR UPDATE' : ''}`,
    params,
  );
  if (!rows[0]) throw notFound('اللوك');
  return rows[0] as { id: string; store_id: string };
}

export async function getAdminLook(ctx: Ctx, staff: StaffContext, id: string) {
  await findScoped(ctx.db, staff, id);
  const [look, items] = await Promise.all([
    ctx.db.query(`${LIST_SELECT} WHERE l.id = $1 GROUP BY l.id, s.id`, [id]),
    ctx.db.query(
      `SELECT p.id, p.name_ar, p.base_price, p.status,
              (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url,
              (SELECT color_hex FROM product_variants v WHERE v.product_id = p.id ORDER BY v.position LIMIT 1) AS color_hex,
              (SELECT COALESCE(SUM(stock_qty), 0) FROM product_variants v WHERE v.product_id = p.id)::int AS stock
         FROM look_items li JOIN products p ON p.id = li.product_id
        WHERE li.look_id = $1 ORDER BY li.position`,
      [id],
    ),
  ]);
  return {
    ...mapRow(look.rows[0]),
    items: items.rows.map((r) => ({
      id: r.id as string,
      name: r.name_ar as string,
      price: Number(r.base_price),
      status: r.status as string,
      imageUrl: r.image_url as string | null,
      colorHex: r.color_hex as string | null,
      stock: r.stock as number,
    })),
  };
}

function lookSlug(): string {
  return `look-${randomBytes(4).toString('hex')}`;
}

/** Pieces: 2–8 different products, all of the look's store (the DB trigger also refuses others). */
async function checkItems(db: Queryable, storeId: string, productIds: string[]) {
  const ids = [...new Set(productIds)];
  if (ids.length !== productIds.length) throw badRequest('duplicate_items', 'كل قطعة تُضاف مرة واحدة');
  if (ids.length < LOOK_MIN_ITEMS || ids.length > LOOK_MAX_ITEMS) {
    throw badRequest('items_count', `اللوك من ${LOOK_MIN_ITEMS} إلى ${LOOK_MAX_ITEMS} قطع`);
  }
  const { rows } = await db.query(`SELECT id, store_id FROM products WHERE id = ANY($1::uuid[])`, [ids]);
  if (rows.length !== ids.length) throw notFound('المنتج');
  if (rows.some((r) => r.store_id !== storeId)) {
    throw badRequest('look_single_store', 'كل قطع اللوك من نفس المتجر، حتى يُضاف كاملاً لسلة واحدة');
  }
}

async function saveItems(db: Queryable, lookId: string, productIds: string[]) {
  await db.query(`DELETE FROM look_items WHERE look_id = $1`, [lookId]);
  await db.query(
    `INSERT INTO look_items (look_id, product_id, position)
     SELECT $1, x.id, x.pos FROM unnest($2::uuid[]) WITH ORDINALITY AS x(id, pos)`,
    [lookId, productIds],
  );
}

export async function createLook(ctx: Ctx, staff: StaffContext, input: LookInput) {
  const storeId = staff.storeId ?? input.storeId;
  if (!storeId) throw badRequest('store_required', 'اختاري المتجر');
  const id = await inTransaction(ctx.db, async (db) => {
    await checkItems(db, storeId, input.productIds);
    const { rows } = await db.query(
      `INSERT INTO looks (store_id, slug, title_ar, subtitle_ar, cover_url, is_active, is_featured, created_by, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT COALESCE(max(sort_order), 0) + 1 FROM looks))
       RETURNING id`,
      [
        storeId,
        lookSlug(),
        input.title.trim(),
        input.subtitle?.trim() || null,
        input.coverUrl?.trim() || null,
        input.isActive ?? true,
        // Only Stylo staff feature a look on the home screen.
        staff.storeId ? false : (input.isFeatured ?? false),
        staff.userId,
      ],
    );
    await saveItems(db, rows[0].id, input.productIds);
    return rows[0].id as string;
  });
  return getAdminLook(ctx, staff, id);
}

export async function updateLook(ctx: Ctx, staff: StaffContext, id: string, input: Partial<LookInput>) {
  await inTransaction(ctx.db, async (db) => {
    const current = await findScoped(db, staff, id, true);
    if (input.storeId && input.storeId !== current.store_id) {
      throw badRequest('store_change', 'لا يمكن نقل لوك إلى متجر آخر');
    }
    const sets: string[] = [];
    const params: unknown[] = [id];
    const set = (col: string, v: unknown) => sets.push(`${col} = $${params.push(v)}`);
    if (input.title !== undefined) set('title_ar', input.title.trim());
    if (input.subtitle !== undefined) set('subtitle_ar', input.subtitle?.trim() || null);
    if (input.coverUrl !== undefined) set('cover_url', input.coverUrl?.trim() || null);
    if (input.isActive !== undefined) set('is_active', input.isActive);
    if (input.isFeatured !== undefined && !staff.storeId) set('is_featured', input.isFeatured);
    if (sets.length) await db.query(`UPDATE looks SET ${sets.join(', ')} WHERE id = $1`, params);
    if (input.productIds) {
      await checkItems(db, current.store_id, input.productIds);
      await saveItems(db, id, input.productIds);
    }
  });
  return getAdminLook(ctx, staff, id);
}

export async function deleteLook(ctx: Ctx, staff: StaffContext, id: string) {
  await findScoped(ctx.db, staff, id);
  await ctx.db.query(`DELETE FROM looks WHERE id = $1`, [id]);
  return { id, deleted: true };
}

/** Home order of looks (Stylo staff): all looks, once each. Featured ones still come first. */
export async function reorderLooks(ctx: Ctx, staff: StaffContext, ids: string[]) {
  await inTransaction(ctx.db, async (db) => {
    const { rows } = await db.query(`SELECT id FROM looks FOR UPDATE`);
    const all = new Set(rows.map((r) => r.id as string));
    if (all.size !== ids.length || !ids.every((i) => all.has(i))) {
      throw badRequest('invalid_order', 'أرسلي كل اللوكات مرة واحدة بالترتيب الجديد');
    }
    await db.query(
      `UPDATE looks l SET sort_order = x.pos FROM unnest($1::uuid[]) WITH ORDINALITY AS x(id, pos) WHERE l.id = x.id`,
      [ids],
    );
  });
  return listAdminLooks(ctx, staff);
}
