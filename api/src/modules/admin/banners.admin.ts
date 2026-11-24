import { inTransaction, type Queryable } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { badRequest, notFound } from '../../lib/errors.js';
import type { StaffContext } from './permissions.js';

/**
 * Home banners (البنرات): the pink hero carousel. Up to 5 live banners are shown, in order.
 * A banner is live when shown (is_active) and inside its optional window (starts_at … ends_at).
 * The link opens a screen inside the app — see BANNER_LINK (same rule as the DB CHECK).
 */

/** In-app routes a banner may open (mirrors CHECK banners_link_in_app). */
export const BANNER_LINK = /^\/(products\?[A-Za-z0-9_=&%.-]+|store\/[a-z0-9-]+|look\/[a-z0-9-]+|product\/[0-9a-f-]{36}|categories)$/;

/** Shown on the home screen at most. */
export const MAX_LIVE_BANNERS = 5;

export type BannerState = 'live' | 'scheduled' | 'expired' | 'hidden';

export interface BannerInput {
  title: string;
  subtitle?: string | null;
  cta?: string | null;
  imageUrl?: string | null;
  link?: string | null;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

const SELECT = `
  SELECT b.id, b.title_ar, b.subtitle_ar, b.cta_ar, b.image_url, b.link, b.sort_order, b.is_active,
         b.starts_at, b.ends_at, b.created_at, b.updated_at, u.full_name AS created_by
    FROM banners b LEFT JOIN users u ON u.id = b.created_by`;

function state(r: { is_active: boolean; starts_at: Date | null; ends_at: Date | null }, now: Date): BannerState {
  if (!r.is_active) return 'hidden';
  if (r.starts_at && r.starts_at > now) return 'scheduled';
  if (r.ends_at && r.ends_at <= now) return 'expired';
  return 'live';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function map(r: any, now: Date) {
  return {
    id: r.id as string,
    title: r.title_ar as string,
    subtitle: r.subtitle_ar as string | null,
    cta: r.cta_ar as string | null,
    imageUrl: r.image_url as string | null,
    link: r.link as string | null,
    sortOrder: r.sort_order as number,
    isActive: r.is_active as boolean,
    startsAt: r.starts_at ? (r.starts_at as Date).toISOString() : null,
    endsAt: r.ends_at ? (r.ends_at as Date).toISOString() : null,
    state: state(r, now),
    createdBy: r.created_by as string | null,
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

export async function listBanners(ctx: Ctx) {
  const { rows } = await ctx.db.query(`${SELECT} ORDER BY b.sort_order, b.created_at`);
  const items = rows.map((r) => map(r, ctx.now));
  // Which live banners actually make it to the home screen (the first MAX_LIVE_BANNERS).
  let shown = 0;
  return items.map((b) => ({ ...b, onHome: b.state === 'live' && ++shown <= MAX_LIVE_BANNERS }));
}

async function find(db: Queryable, id: string, now: Date) {
  const { rows } = await db.query(`${SELECT} WHERE b.id = $1`, [id]);
  if (!rows[0]) throw notFound('البنر');
  return map(rows[0], now);
}

function check(input: Partial<BannerInput>) {
  if (input.link && !BANNER_LINK.test(input.link)) {
    throw badRequest('invalid_link', 'الرابط يجب أن يفتح صفحة داخل التطبيق (قسم، متجر، لوك، منتج أو عروض)');
  }
  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw badRequest('invalid_window', 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
  }
}

export async function createBanner(ctx: Ctx, staff: StaffContext, input: BannerInput) {
  check(input);
  const { rows } = await ctx.db.query(
    `INSERT INTO banners (title_ar, subtitle_ar, cta_ar, image_url, link, is_active, starts_at, ends_at, created_by,
                          sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT COALESCE(max(sort_order), 0) + 1 FROM banners))
     RETURNING id`,
    [
      input.title.trim(),
      input.subtitle?.trim() || null,
      input.cta?.trim() || null,
      input.imageUrl?.trim() || null,
      input.link || null,
      input.isActive ?? true,
      input.startsAt || null,
      input.endsAt || null,
      staff.userId,
    ],
  );
  return find(ctx.db, rows[0].id, ctx.now);
}

export async function updateBanner(ctx: Ctx, id: string, input: Partial<BannerInput>) {
  check(input);
  await inTransaction(ctx.db, async (db) => {
    const current = await find(db, id, ctx.now);
    const starts = input.startsAt !== undefined ? input.startsAt : current.startsAt;
    const ends = input.endsAt !== undefined ? input.endsAt : current.endsAt;
    if (starts && ends && Date.parse(ends) <= Date.parse(starts)) {
      throw badRequest('invalid_window', 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
    }
    const sets: string[] = [];
    const params: unknown[] = [id];
    const set = (col: string, v: unknown) => sets.push(`${col} = $${params.push(v)}`);
    if (input.title !== undefined) set('title_ar', input.title.trim());
    if (input.subtitle !== undefined) set('subtitle_ar', input.subtitle?.trim() || null);
    if (input.cta !== undefined) set('cta_ar', input.cta?.trim() || null);
    if (input.imageUrl !== undefined) set('image_url', input.imageUrl?.trim() || null);
    if (input.link !== undefined) set('link', input.link || null);
    if (input.isActive !== undefined) set('is_active', input.isActive);
    if (input.startsAt !== undefined) set('starts_at', input.startsAt || null);
    if (input.endsAt !== undefined) set('ends_at', input.endsAt || null);
    if (sets.length) await db.query(`UPDATE banners SET ${sets.join(', ')} WHERE id = $1`, params);
  });
  return find(ctx.db, id, ctx.now);
}

export async function deleteBanner(ctx: Ctx, id: string) {
  const { rowCount } = await ctx.db.query(`DELETE FROM banners WHERE id = $1`, [id]);
  if (!rowCount) throw notFound('البنر');
  return { id, deleted: true };
}

export async function reorderBanners(ctx: Ctx, ids: string[]) {
  await inTransaction(ctx.db, async (db) => {
    const { rows } = await db.query(`SELECT id FROM banners FOR UPDATE`);
    const all = new Set(rows.map((r) => r.id as string));
    if (all.size !== ids.length || !ids.every((i) => all.has(i))) {
      throw badRequest('invalid_order', 'أرسلي كل البنرات مرة واحدة بالترتيب الجديد');
    }
    await db.query(
      `UPDATE banners b SET sort_order = x.pos FROM unnest($1::uuid[]) WITH ORDINALITY AS x(id, pos) WHERE b.id = x.id`,
      [ids],
    );
  });
  return listBanners(ctx);
}
