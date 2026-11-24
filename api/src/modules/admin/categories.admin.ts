import { randomBytes } from 'node:crypto';

import { inTransaction, type Queryable } from '../../db.js';
import { CATEGORY_ICONS } from '../../lib/category-icons.js';
import type { Ctx } from '../../lib/context.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import type { StaffContext } from './permissions.js';

/**
 * Categories (الأقسام): two levels — main categories (نساء، رجال…) and their sub-categories
 * (فساتين، عبايات…). Managed with `categories.manage`; store staff only read the visible ones to
 * file their products.
 *
 * - Hidden (is_active = false) categories disappear from the customer app, search filters and the
 *   sitemap; hiding a main category hides its sub-categories too. Products keep their category.
 * - A category with products or sub-categories cannot be deleted (hide it instead).
 * - Order: `sort_order` within the same parent (POST /admin/categories/reorder).
 */

export interface AdminCategory {
  id: string;
  parentId: string | null;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  icon: string | null;
  color: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Products filed directly in this category. */
  productCount: number;
  /** For a main category: products in it and in its sub-categories. */
  totalProductCount: number;
  childrenCount: number;
}

export interface CategoryInput {
  nameAr: string;
  nameEn?: string | null;
  slug?: string | null;
  parentId?: string | null;
  icon?: string | null;
  color?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
}

const SELECT = `
  SELECT c.id, c.parent_id, c.slug, c.name_ar, c.name_en, c.icon, c.color, c.image_url, c.is_active, c.sort_order,
         (SELECT count(*) FROM products p WHERE p.category_id = c.id)::int AS product_count,
         (SELECT count(*) FROM products p LEFT JOIN categories pc ON pc.id = p.category_id
           WHERE p.category_id = c.id OR pc.parent_id = c.id)::int AS total_product_count,
         (SELECT count(*) FROM categories k WHERE k.parent_id = c.id)::int AS children_count
    FROM categories c`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function map(r: any): AdminCategory {
  return {
    id: r.id,
    parentId: r.parent_id,
    slug: r.slug,
    nameAr: r.name_ar,
    nameEn: r.name_en,
    icon: r.icon,
    color: r.color,
    imageUrl: r.image_url,
    isActive: r.is_active,
    sortOrder: r.sort_order,
    productCount: r.product_count,
    totalProductCount: r.total_product_count,
    childrenCount: r.children_count,
  };
}

/**
 * Main categories first (in order), each followed by its sub-categories (in order).
 * Without `categories.manage` (store staff filing products) only visible categories are listed.
 */
export async function listAdminCategories(ctx: Ctx, staff: StaffContext): Promise<AdminCategory[]> {
  const all = !staff.storeId && staff.permissions.has('categories.manage');
  const { rows } = await ctx.db.query(
    `${SELECT}
       LEFT JOIN categories parent ON parent.id = c.parent_id
      ${all ? '' : 'WHERE c.is_active AND (parent.id IS NULL OR parent.is_active)'}
      ORDER BY COALESCE(parent.sort_order, c.sort_order), COALESCE(parent.id, c.id), c.parent_id NULLS FIRST,
               c.sort_order, c.name_ar`,
  );
  return rows.map(map);
}

async function findCategory(db: Queryable, id: string, lock = false) {
  const { rows } = await db.query(`${SELECT} WHERE c.id = $1 ${lock ? 'FOR UPDATE OF c' : ''}`, [id]);
  if (!rows[0]) throw notFound('القسم');
  return map(rows[0]);
}

/** "Women's watches" → "womens-watches"; Arabic-only names get a short random slug. */
export function categorySlug(nameEn: string | null | undefined, parentSlug?: string | null): string {
  const base = (nameEn ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const core = base || `c-${randomBytes(3).toString('hex')}`;
  return parentSlug && !core.startsWith(`${parentSlug}-`) ? `${parentSlug}-${core}`.slice(0, 60) : core;
}

function checkIcon(icon: string | null | undefined) {
  if (icon && !(CATEGORY_ICONS as readonly string[]).includes(icon)) {
    throw badRequest('invalid_icon', 'اختاري أيقونة من القائمة');
  }
}

async function checkParent(db: Queryable, parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return null;
  if (parentId === selfId) throw badRequest('invalid_parent', 'لا يمكن أن يكون القسم تابعاً لنفسه');
  const { rows } = await db.query(`SELECT id, slug, parent_id FROM categories WHERE id = $1`, [parentId]);
  if (!rows[0]) throw notFound('القسم الرئيسي');
  if (rows[0].parent_id) throw badRequest('invalid_parent', 'اختاري قسماً رئيسياً (الأقسام مستويان فقط)');
  return rows[0] as { id: string; slug: string };
}

export async function createCategory(ctx: Ctx, input: CategoryInput) {
  checkIcon(input.icon);
  const id = await inTransaction(ctx.db, async (db) => {
    const parent = await checkParent(db, input.parentId);
    const slug = input.slug?.trim() || categorySlug(input.nameEn, parent?.slug);
    const { rows } = await db.query(
      `INSERT INTO categories (parent_id, slug, name_ar, name_en, icon, color, image_url, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               (SELECT COALESCE(max(sort_order), 0) + 1 FROM categories WHERE parent_id IS NOT DISTINCT FROM $1))
       RETURNING id`,
      [
        parent?.id ?? null,
        slug,
        input.nameAr.trim(),
        input.nameEn?.trim() || null,
        input.icon || null,
        input.color || null,
        input.imageUrl?.trim() || null,
        input.isActive ?? true,
      ],
    );
    return rows[0].id as string;
  });
  return findCategory(ctx.db, id);
}

export async function updateCategory(ctx: Ctx, id: string, input: Partial<CategoryInput>) {
  checkIcon(input.icon);
  await inTransaction(ctx.db, async (db) => {
    const current = await findCategory(db, id, true);
    const sets: string[] = [];
    const params: unknown[] = [id];
    const set = (col: string, v: unknown) => sets.push(`${col} = $${params.push(v)}`);
    if (input.parentId !== undefined && input.parentId !== current.parentId) {
      const parent = await checkParent(db, input.parentId, id);
      if (parent && current.childrenCount > 0) {
        throw badRequest('invalid_parent', 'هذا القسم له أقسام فرعية، فلا يمكن جعله فرعياً');
      }
      set('parent_id', parent?.id ?? null);
      // Moved: goes to the end of its new list.
      sets.push(
        `sort_order = (SELECT COALESCE(max(sort_order), 0) + 1 FROM categories WHERE parent_id IS NOT DISTINCT FROM $${params.push(parent?.id ?? null)})`,
      );
    }
    if (input.nameAr !== undefined) set('name_ar', input.nameAr.trim());
    if (input.nameEn !== undefined) set('name_en', input.nameEn?.trim() || null);
    if (input.slug !== undefined && input.slug?.trim()) set('slug', input.slug.trim());
    if (input.icon !== undefined) set('icon', input.icon || null);
    if (input.color !== undefined) set('color', input.color || null);
    if (input.imageUrl !== undefined) set('image_url', input.imageUrl?.trim() || null);
    if (input.isActive !== undefined) set('is_active', input.isActive);
    if (sets.length) await db.query(`UPDATE categories SET ${sets.join(', ')} WHERE id = $1`, params);
  });
  return findCategory(ctx.db, id);
}

export async function deleteCategory(ctx: Ctx, id: string) {
  await inTransaction(ctx.db, async (db) => {
    const c = await findCategory(db, id, true);
    if (c.childrenCount > 0) {
      throw conflict('category_has_children', 'احذفي الأقسام الفرعية أولاً، أو أخفي القسم بدلاً من حذفه');
    }
    if (c.productCount > 0) {
      throw conflict(
        'category_has_products',
        `في هذا القسم ${c.productCount} منتج. انقليها لقسم آخر أو أخفي القسم بدلاً من حذفه`,
      );
    }
    await db.query(`DELETE FROM categories WHERE id = $1`, [id]);
  });
  return { id, deleted: true };
}

/** New order for the categories of one parent (null = main categories): `ids` in display order. */
export async function reorderCategories(ctx: Ctx, input: { parentId: string | null; ids: string[] }) {
  await inTransaction(ctx.db, async (db) => {
    const { rows } = await db.query(
      `SELECT id FROM categories WHERE parent_id IS NOT DISTINCT FROM $1 FOR UPDATE`,
      [input.parentId],
    );
    const siblings = new Set(rows.map((r) => r.id as string));
    if (siblings.size !== input.ids.length || !input.ids.every((i) => siblings.has(i))) {
      throw badRequest('invalid_order', 'أرسلي كل أقسام هذا المستوى مرة واحدة بالترتيب الجديد');
    }
    await db.query(
      `UPDATE categories c SET sort_order = x.pos
         FROM unnest($1::uuid[]) WITH ORDINALITY AS x(id, pos) WHERE c.id = x.id`,
      [input.ids],
    );
  });
}

/**
 * Products can only be filed in a visible category (keeping the current one, even hidden, is fine
 * so an unrelated edit does not fail).
 */
export async function assertCategoryUsable(db: Queryable, categoryId: string | null | undefined, currentId?: string | null) {
  if (!categoryId || categoryId === currentId) return;
  const { rows } = await db.query(
    `SELECT c.is_active AND (p.id IS NULL OR p.is_active) AS visible
       FROM categories c LEFT JOIN categories p ON p.id = c.parent_id WHERE c.id = $1`,
    [categoryId],
  );
  if (!rows[0]) throw notFound('القسم');
  if (!rows[0].visible) throw badRequest('category_hidden', 'هذا القسم مخفي حالياً، اختاري قسماً آخر');
}
