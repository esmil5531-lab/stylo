import { randomBytes } from 'node:crypto';

import { inTransaction, type Queryable } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { PERMISSIONS, type Permission, type StaffContext } from './permissions.js';

/**
 * Stores, staff and drivers managed from the back office.
 * Money is in LYD dirhams (1 د.ل = 1000); the admin UI converts.
 */

export const STORE_STATUSES = ['pending_review', 'active', 'suspended'] as const;
export const DRIVER_STATUSES = ['available', 'busy', 'offline'] as const;
export const VEHICLES = ['motorcycle', 'car', 'van'] as const;

/** Libyan phone numbers, normalised to +218XXXXXXXXX. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  let local = digits.replace(/^\+?218/, '').replace(/^0/, '');
  if (!/^9[1-5]\d{7}$/.test(local)) {
    throw badRequest('invalid_phone', 'رقم الهاتف غير صحيح. مثال: 0912345678');
  }
  local = `+218${local}`;
  return local;
}

async function assertPhoneFree(db: Queryable, phone: string, email?: string | null) {
  const { rows } = await db.query(
    `SELECT phone, email FROM users WHERE phone = $1 OR ($2::citext IS NOT NULL AND email = $2::citext) LIMIT 1`,
    [phone, email ?? null],
  );
  if (rows[0]) {
    throw conflict(
      'duplicate_user',
      rows[0].phone === phone ? 'رقم الهاتف مسجّل لحساب آخر' : 'البريد الإلكتروني مسجّل لحساب آخر',
    );
  }
}

// ================================================================ stores

const STORE_SELECT = `
  SELECT s.id, s.slug, s.name_ar, s.name_en, s.logo_text, s.brand_color, s.city, s.prep_hours,
         s.delivery_fee, s.status, s.is_featured, s.commission_bps, s.rating_avg, s.created_at,
         u.id AS owner_id, u.full_name AS owner_name, u.phone AS owner_phone,
         (SELECT count(*)::int FROM products p WHERE p.store_id = s.id AND p.status = 'active') AS products_count,
         (SELECT count(*)::int FROM orders o WHERE o.store_id = s.id
            AND o.status NOT IN ('delivered', 'cancelled')) AS open_orders
    FROM stores s JOIN users u ON u.id = s.owner_id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStore(r: any) {
  return {
    id: r.id as string,
    slug: r.slug as string,
    nameAr: r.name_ar as string,
    nameEn: r.name_en as string | null,
    logoText: r.logo_text as string | null,
    brandColor: r.brand_color as string | null,
    city: r.city as string,
    prepHours: r.prep_hours as number,
    deliveryFee: r.delivery_fee as number,
    status: r.status as (typeof STORE_STATUSES)[number],
    isFeatured: r.is_featured as boolean,
    commissionBps: r.commission_bps as number,
    rating: r.rating_avg as number,
    createdAt: (r.created_at as Date).toISOString(),
    owner: { id: r.owner_id as string, name: r.owner_name as string, phone: r.owner_phone as string | null },
    productsCount: r.products_count as number,
    openOrders: r.open_orders as number,
  };
}

export async function listStores(ctx: Ctx, staff: StaffContext, q: { status?: string; search?: string }) {
  const params: unknown[] = [];
  const where: string[] = ['TRUE'];
  if (staff.storeId) where.push(`s.id = $${params.push(staff.storeId)}`);
  if (q.status) where.push(`s.status = $${params.push(q.status)}`);
  if (q.search) {
    const like = `$${params.push(`%${q.search}%`)}`;
    where.push(`(s.name_ar ILIKE ${like} OR s.name_en ILIKE ${like} OR s.city ILIKE ${like})`);
  }
  const { rows } = await ctx.db.query(`${STORE_SELECT} WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC`, params);
  return rows.map(mapStore);
}

async function getStore(db: Queryable, id: string) {
  const { rows } = await db.query(`${STORE_SELECT} WHERE s.id = $1`, [id]);
  if (!rows[0]) throw notFound('المتجر');
  return mapStore(rows[0]);
}

function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.length >= 2 ? s : `store-${randomBytes(3).toString('hex')}`;
}

export interface StoreInput {
  nameAr: string;
  nameEn?: string | null;
  city: string;
  deliveryFee: number;
  prepHours: number;
  status: (typeof STORE_STATUSES)[number];
  isFeatured: boolean;
  logoText?: string | null;
  owner: { fullName: string; phone: string; email?: string | null };
}

export async function createStore(ctx: Ctx, staff: StaffContext, input: StoreInput) {
  const id = await inTransaction(ctx.db, async (db) => {
    const phone = normalisePhone(input.owner.phone);
    // Reuse an existing vendor account (owner of several stores), otherwise create one.
    const existing = await db.query(`SELECT id, role FROM users WHERE phone = $1`, [phone]);
    let ownerId: string;
    if (existing.rows[0]) {
      if (existing.rows[0].role !== 'vendor') {
        throw conflict('duplicate_user', 'رقم الهاتف مسجّل لحساب ليس تاجراً');
      }
      ownerId = existing.rows[0].id;
    } else {
      await assertPhoneFree(db, phone, input.owner.email);
      const u = await db.query(
        `INSERT INTO users (full_name, phone, email, role) VALUES ($1, $2, $3, 'vendor') RETURNING id`,
        [input.owner.fullName.trim(), phone, input.owner.email || null],
      );
      ownerId = u.rows[0].id;
    }

    let slug = slugify(input.nameEn || '');
    const taken = await db.query(`SELECT 1 FROM stores WHERE slug = $1`, [slug]);
    if (taken.rowCount) slug = `${slug}-${randomBytes(2).toString('hex')}`;

    const { rows } = await db.query(
      `INSERT INTO stores (owner_id, slug, name_ar, name_en, logo_text, city, prep_hours, delivery_fee, status, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        ownerId,
        slug,
        input.nameAr.trim(),
        input.nameEn?.trim() || null,
        input.logoText?.trim() || input.nameEn?.trim().toUpperCase() || null,
        input.city,
        input.prepHours,
        input.deliveryFee,
        input.status,
        input.isFeatured,
      ],
    );
    return rows[0].id as string;
  });
  void staff;
  return getStore(ctx.db, id);
}

export async function updateStore(
  ctx: Ctx,
  id: string,
  input: Partial<Omit<StoreInput, 'owner'>>,
) {
  const map: Record<string, unknown> = {
    name_ar: input.nameAr?.trim(),
    name_en: input.nameEn === undefined ? undefined : input.nameEn?.trim() || null,
    logo_text: input.logoText === undefined ? undefined : input.logoText?.trim() || null,
    city: input.city,
    delivery_fee: input.deliveryFee,
    prep_hours: input.prepHours,
    status: input.status,
    is_featured: input.isFeatured,
  };
  const entries = Object.entries(map).filter(([, v]) => v !== undefined);
  if (entries.length) {
    const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
    const { rowCount } = await ctx.db.query(`UPDATE stores SET ${sets} WHERE id = $1`, [
      id,
      ...entries.map(([, v]) => v),
    ]);
    if (!rowCount) throw notFound('المتجر');
  }
  return getStore(ctx.db, id);
}

// ================================================================ staff

export async function listRoles(ctx: Ctx) {
  const { rows } = await ctx.db.query(
    `SELECT key, name_ar, description_ar, permissions, store_scoped FROM staff_roles ORDER BY sort_order`,
  );
  return rows.map((r) => ({
    key: r.key as string,
    name: r.name_ar as string,
    description: r.description_ar as string | null,
    storeScoped: r.store_scoped as boolean,
    permissions: (r.permissions as string[])
      .filter((p): p is Permission => p in PERMISSIONS)
      .map((p) => ({ key: p, label: PERMISSIONS[p] })),
  }));
}

const STAFF_SELECT = `
  SELECT u.id, u.full_name, u.phone, u.email, sm.role_key, r.name_ar AS role_name, sm.store_id,
         s.name_ar AS store_name, sm.job_title, sm.is_active, sm.created_at
    FROM staff_members sm
    JOIN users u ON u.id = sm.user_id
    JOIN staff_roles r ON r.key = sm.role_key
    LEFT JOIN stores s ON s.id = sm.store_id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStaff(r: any) {
  return {
    id: r.id as string,
    fullName: r.full_name as string,
    phone: r.phone as string | null,
    email: r.email as string | null,
    role: { key: r.role_key as string, name: r.role_name as string },
    store: r.store_id ? { id: r.store_id as string, name: r.store_name as string } : null,
    jobTitle: r.job_title as string | null,
    isActive: r.is_active as boolean,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export async function listStaff(ctx: Ctx) {
  const { rows } = await ctx.db.query(`${STAFF_SELECT} ORDER BY sm.is_active DESC, r.sort_order, u.full_name`);
  return rows.map(mapStaff);
}

async function getStaff(db: Queryable, id: string) {
  const { rows } = await db.query(`${STAFF_SELECT} WHERE u.id = $1`, [id]);
  if (!rows[0]) throw notFound('الموظف');
  return mapStaff(rows[0]);
}

/** Nobody can hand out more power than they have (no privilege escalation). */
async function assertCanGrantRole(db: Queryable, staff: StaffContext, roleKey: string, storeId?: string | null) {
  const { rows } = await db.query(`SELECT permissions, store_scoped FROM staff_roles WHERE key = $1`, [roleKey]);
  const role = rows[0];
  if (!role) throw badRequest('invalid_role', 'الدور غير موجود');
  const missing = (role.permissions as string[]).filter((p) => !staff.permissions.has(p as Permission));
  if (missing.length) throw forbidden('لا يمكنك منح دور بصلاحيات أعلى من صلاحياتك');
  if (role.store_scoped && !storeId) throw badRequest('store_required', 'هذا الدور يتطلب اختيار متجر');
  if (!role.store_scoped && storeId) throw badRequest('store_not_allowed', 'هذا الدور لموظفي ستايلو ولا يرتبط بمتجر');
}

export interface StaffInput {
  fullName: string;
  phone: string;
  email?: string | null;
  roleKey: string;
  storeId?: string | null;
  jobTitle?: string | null;
}

export async function createStaff(ctx: Ctx, staff: StaffContext, input: StaffInput) {
  const id = await inTransaction(ctx.db, async (db) => {
    await assertCanGrantRole(db, staff, input.roleKey, input.storeId);
    const phone = normalisePhone(input.phone);
    await assertPhoneFree(db, phone, input.email);
    const u = await db.query(
      `INSERT INTO users (full_name, phone, email, role) VALUES ($1, $2, $3, 'staff') RETURNING id`,
      [input.fullName.trim(), phone, input.email || null],
    );
    await db.query(
      `INSERT INTO staff_members (user_id, role_key, store_id, job_title, created_by) VALUES ($1, $2, $3, $4, $5)`,
      [u.rows[0].id, input.roleKey, input.storeId ?? null, input.jobTitle?.trim() || null, staff.userId],
    );
    return u.rows[0].id as string;
  });
  return getStaff(ctx.db, id);
}

export async function updateStaff(
  ctx: Ctx,
  staff: StaffContext,
  id: string,
  input: { roleKey?: string; storeId?: string | null; jobTitle?: string | null; isActive?: boolean },
) {
  if (id === staff.userId && (input.isActive === false || input.roleKey)) {
    throw forbidden('لا يمكنك تعطيل حسابك أو تغيير دورك بنفسك');
  }
  await inTransaction(ctx.db, async (db) => {
    const current = await getStaff(db, id);
    // Editing someone with more power than you is also escalation.
    await assertCanGrantRole(db, staff, current.role.key, current.store?.id);
    const roleKey = input.roleKey ?? current.role.key;
    const storeId = input.storeId === undefined ? (current.store?.id ?? null) : input.storeId;
    if (input.roleKey || input.storeId !== undefined) await assertCanGrantRole(db, staff, roleKey, storeId);
    await db.query(
      `UPDATE staff_members SET role_key = $2, store_id = $3,
              job_title = COALESCE($4, job_title), is_active = COALESCE($5, is_active)
        WHERE user_id = $1`,
      [id, roleKey, storeId, input.jobTitle === undefined ? null : input.jobTitle, input.isActive ?? null],
    );
  });
  return getStaff(ctx.db, id);
}

// ================================================================ drivers

const DRIVER_SELECT = `
  SELECT u.id, u.full_name, u.phone, d.city, d.vehicle, d.plate_number, d.status, d.is_active, d.created_at,
         (SELECT count(*)::int FROM orders o WHERE o.driver_id = d.user_id AND o.status = 'shipped') AS active_orders,
         (SELECT count(*)::int FROM orders o WHERE o.driver_id = d.user_id AND o.status = 'delivered') AS delivered_orders
    FROM drivers d JOIN users u ON u.id = d.user_id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDriver(r: any) {
  return {
    id: r.id as string,
    fullName: r.full_name as string,
    phone: r.phone as string | null,
    city: r.city as string,
    vehicle: r.vehicle as (typeof VEHICLES)[number],
    plateNumber: r.plate_number as string | null,
    status: r.status as (typeof DRIVER_STATUSES)[number],
    isActive: r.is_active as boolean,
    activeOrders: r.active_orders as number,
    deliveredOrders: r.delivered_orders as number,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export async function listDrivers(ctx: Ctx, q: { status?: string; city?: string }) {
  const params: unknown[] = [];
  const where = ['TRUE'];
  if (q.status) where.push(`d.status = $${params.push(q.status)}`);
  if (q.city) where.push(`d.city = $${params.push(q.city)}`);
  const { rows } = await ctx.db.query(
    `${DRIVER_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY d.is_active DESC, (d.status = 'available') DESC, u.full_name`,
    params,
  );
  return rows.map(mapDriver);
}

async function getDriver(db: Queryable, id: string) {
  const { rows } = await db.query(`${DRIVER_SELECT} WHERE d.user_id = $1`, [id]);
  if (!rows[0]) throw notFound('السائق');
  return mapDriver(rows[0]);
}

export interface DriverInput {
  fullName: string;
  phone: string;
  city: string;
  vehicle: (typeof VEHICLES)[number];
  plateNumber?: string | null;
}

export async function createDriver(ctx: Ctx, staff: StaffContext, input: DriverInput) {
  const id = await inTransaction(ctx.db, async (db) => {
    const phone = normalisePhone(input.phone);
    await assertPhoneFree(db, phone);
    const u = await db.query(
      `INSERT INTO users (full_name, phone, role) VALUES ($1, $2, 'driver') RETURNING id`,
      [input.fullName.trim(), phone],
    );
    await db.query(
      `INSERT INTO drivers (user_id, city, vehicle, plate_number, status, created_by)
       VALUES ($1, $2, $3, $4, 'offline', $5)`,
      [u.rows[0].id, input.city, input.vehicle, input.plateNumber?.trim() || null, staff.userId],
    );
    return u.rows[0].id as string;
  });
  return getDriver(ctx.db, id);
}

export async function updateDriver(
  ctx: Ctx,
  id: string,
  input: Partial<Omit<DriverInput, 'fullName' | 'phone'>> & {
    status?: (typeof DRIVER_STATUSES)[number];
    isActive?: boolean;
  },
) {
  const current = await getDriver(ctx.db, id);
  if (input.status === 'offline' && current.activeOrders > 0) {
    throw conflict('driver_has_orders', 'لدى السائق طلبات قيد التوصيل؛ لا يمكن جعله غير متصل الآن');
  }
  if (input.status === 'available' && current.activeOrders > 0) {
    throw conflict('driver_has_orders', 'السائق في توصيلة حالياً؛ تتغير حالته تلقائياً بعد التسليم');
  }
  await ctx.db.query(
    `UPDATE drivers SET city = COALESCE($2, city), vehicle = COALESCE($3, vehicle),
            plate_number = COALESCE($4, plate_number), status = COALESCE($5, status),
            is_active = COALESCE($6, is_active)
      WHERE user_id = $1`,
    [id, input.city ?? null, input.vehicle ?? null, input.plateNumber ?? null, input.status ?? null, input.isActive ?? null],
  );
  return getDriver(ctx.db, id);
}

// ================================================================ dashboard

export async function getDashboard(ctx: Ctx, staff: StaffContext) {
  const params: unknown[] = [];
  const scoped = staff.storeId ? `o.store_id = $${params.push(staff.storeId)}` : 'TRUE';
  const [byStatus, today, stores, drivers] = await Promise.all([
    ctx.db.query(`SELECT o.status, count(*)::int AS n FROM orders o WHERE ${scoped} GROUP BY 1`, params),
    ctx.db.query(
      `SELECT count(*)::int AS orders, COALESCE(SUM(o.total), 0)::bigint AS sales
         FROM orders o
        WHERE ${scoped} AND o.status <> 'cancelled'
          AND (o.placed_at AT TIME ZONE 'Africa/Tripoli')::date = (now() AT TIME ZONE 'Africa/Tripoli')::date`,
      params,
    ),
    ctx.db.query(`SELECT status, count(*)::int AS n FROM stores GROUP BY 1`),
    ctx.db.query(`SELECT status, count(*)::int AS n FROM drivers WHERE is_active GROUP BY 1`),
  ]);
  const toMap = (rows: { status: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return {
    scope: staff.storeId ? { storeId: staff.storeId, storeName: staff.storeName } : null,
    ordersByStatus: toMap(byStatus.rows),
    today: { orders: today.rows[0].orders as number, sales: today.rows[0].sales as number, currency: 'LYD' },
    stores: staff.storeId ? null : toMap(stores.rows),
    drivers: staff.storeId ? null : toMap(drivers.rows),
  };
}
