import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { enforceLimit, optionalLimiter } from '../../lib/rate-limit.js';
import { Id, IdParams } from '../../lib/validation.js';
import { assignDriver, changeOrderStatus, getOrder, listOrders, ORDER_STATUSES } from './orders.admin.js';
import {
  createProduct,
  getProduct,
  listProducts,
  PRODUCT_STATUSES,
  updateProduct,
} from './products.admin.js';
import {
  cancelPayout,
  createPayout,
  getPayout,
  listBalances,
  listPayouts,
  markPayoutPaid,
  previewPayout,
} from './payouts.admin.js';
import { getReport } from './reports.admin.js';
import {
  createCategory,
  deleteCategory,
  listAdminCategories,
  reorderCategories,
  updateCategory,
} from './categories.admin.js';
import { CATEGORY_ICONS } from '../../lib/category-icons.js';
import { isMediaUrl, storeImage, type MediaPurpose } from '../../lib/media.js';
import { badRequest, forbidden } from '../../lib/errors.js';
import { BANNER_LINK, createBanner, deleteBanner, listBanners, reorderBanners, updateBanner } from './banners.admin.js';
import {
  createLook,
  deleteLook,
  getAdminLook,
  listAdminLooks,
  LOOK_MAX_ITEMS,
  reorderLooks,
  updateLook,
} from './looks.admin.js';
import { getDriverCustody, getSettlement, listCustody, listSettlements, settleCustody } from './custody.admin.js';
import { notifyOrderStatus } from '../orders/notify.js';
import { DELIVERY_FAILURE_KEYS } from '../orders/delivery-failure.js';
import { listAdminReviews, setReviewHidden } from '../reviews/reviews.service.js';
import {
  createDriver,
  createStaff,
  createStore,
  DRIVER_STATUSES,
  getDashboard,
  getStore,
  listDrivers,
  listRoles,
  listStaff,
  listStores,
  STORE_STATUSES,
  updateDriver,
  updateStaff,
  updateOwnStore,
  updateStore,
  VEHICLES,
} from './people.admin.js';
import {
  loadStaff,
  PERMISSIONS,
  redactFinance,
  requirePermission,
  type Permission,
  type StaffContext,
} from './permissions.js';

declare module 'fastify' {
  interface FastifyRequest {
    staff: StaffContext | null;
  }
}

/** LYD amounts arrive in dirhams (integers). 0–500 د.ل is a sane range for a delivery fee. */
const Dirhams = z.number().int().min(0).max(500_000);
const Name = z.string().trim().min(2).max(80);
const Phone = z.string().trim().min(9).max(20);
const Email = z.string().trim().email().max(120).nullish().or(z.literal(''));
const City = z.string().trim().min(2).max(40);
const OptionalPhone = z.string().trim().max(20).nullish().or(z.literal(''));
/** Basis points: 1000 = 10%. Commission above 50% is almost certainly a typo. */
const CommissionBps = z.number().int().min(0).max(5000);
/** YYYY-MM-DD (Libya calendar day). */
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Update schemas must NOT carry defaults: zod's .partial() still applies them, which would
// silently reset fields the client did not send. Defaults live only on the create schemas.
const StoreFields = z.object({
  nameAr: Name,
  nameEn: z.string().trim().max(80).nullish(),
  logoText: z.string().trim().max(12).nullish(),
  city: City,
  district: z.string().trim().max(60).nullish(),
  addressLine: z.string().trim().max(160).nullish(),
  phone: OptionalPhone,
  deliveryFee: Dirhams,
  prepHours: z.number().int().min(0).max(72),
  status: z.enum(STORE_STATUSES),
  isFeatured: z.boolean(),
  commissionBps: CommissionBps,
});
const StoreCreate = StoreFields.extend({
  prepHours: StoreFields.shape.prepHours.default(4),
  status: StoreFields.shape.status.default('pending_review'),
  isFeatured: StoreFields.shape.isFeatured.default(false),
  commissionBps: CommissionBps.optional(),
  owner: z.object({ fullName: Name, phone: Phone, email: Email }),
});
const StoreUpdate = StoreFields.partial();
// What a store may change about itself («إعدادات متجري»).
const StoreProfile = StoreFields.pick({
  nameAr: true,
  nameEn: true,
  logoText: true,
  district: true,
  addressLine: true,
  phone: true,
  prepHours: true,
}).partial();

/** An uploaded photo (/uploads/…webp) or an http(s) link. */
const MediaUrl = z.string().trim().max(500).refine(isMediaUrl, 'رابط صورة غير صالح');

// Categories: update schema without defaults (see the note above).
const CategoryFields = z.object({
  nameAr: z.string().trim().min(2, 'اسم القسم قصير جداً').max(40),
  nameEn: z.string().trim().max(40).nullish(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'الرابط المختصر: حروف لاتينية صغيرة وأرقام وشرطات فقط')
    .max(60)
    .nullish()
    .or(z.literal('')),
  parentId: Id.nullish(),
  icon: z.enum(CATEGORY_ICONS).nullish(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullish(),
  imageUrl: MediaUrl.nullish().or(z.literal('')),
  isActive: z.boolean(),
});
const CategoryCreate = CategoryFields.extend({ isActive: z.boolean().default(true) });
const CategoryUpdate = CategoryFields.partial();

// Banners & looks: update schemas without defaults (see the note above).
const IsoDate = z.iso.datetime({ offset: true });
const BannerFields = z.object({
  title: z.string().trim().min(2, 'اكتبي عنوان البنر').max(60),
  subtitle: z.string().trim().max(90).nullish(),
  cta: z.string().trim().max(24).nullish(),
  imageUrl: MediaUrl.nullish().or(z.literal('')),
  link: z
    .string()
    .trim()
    .regex(BANNER_LINK, 'الرابط يجب أن يفتح صفحة داخل التطبيق')
    .nullish()
    .or(z.literal('')),
  isActive: z.boolean(),
  startsAt: IsoDate.nullish(),
  endsAt: IsoDate.nullish(),
});
const BannerCreate = BannerFields.extend({ isActive: z.boolean().default(true) });
const BannerUpdate = BannerFields.partial();

const LookFields = z.object({
  storeId: Id.optional(),
  title: z.string().trim().min(2, 'اكتبي اسم اللوك').max(60),
  subtitle: z.string().trim().max(90).nullish(),
  coverUrl: MediaUrl.nullish().or(z.literal('')),
  isActive: z.boolean(),
  isFeatured: z.boolean().optional(),
  productIds: z.array(Id).min(1).max(LOOK_MAX_ITEMS),
});
const LookCreate = LookFields.extend({ isActive: z.boolean().default(true) });
const LookUpdate = LookFields.partial();

const ProductBody = z.object({
  storeId: Id.optional(),
  categoryId: Id.nullish(),
  nameAr: Name,
  nameEn: z.string().trim().max(80).nullish(),
  brand: z.string().trim().max(60).nullish(),
  descriptionAr: z.string().trim().max(2000).nullish(),
  basePrice: z.number().int().min(1).max(100_000_000),
  compareAtPrice: z.number().int().min(1).max(100_000_000).nullish(),
  status: z.enum(PRODUCT_STATUSES),
  isFeatured: z.boolean().optional(),
  images: z.array(MediaUrl).max(8).default([]),
  variants: z
    .array(
      z.object({
        id: Id.optional(),
        size: z.string().trim().max(20).nullish(),
        colorName: z.string().trim().max(30).nullish(),
        colorHex: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .nullish(),
        sku: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9-]{3,40}$/, 'رمز SKU: حروف لاتينية وأرقام وشرطات فقط')
          .nullish()
          .or(z.literal('')),
        price: z.number().int().min(1).max(100_000_000).nullish(),
        stock: z.number().int().min(0).max(100_000),
      }),
    )
    .min(1)
    .max(100),
});

const StaffBody = z.object({
  fullName: Name,
  phone: Phone,
  email: Email,
  roleKey: z.string().min(2).max(40),
  storeId: Id.nullish(),
  jobTitle: z.string().trim().max(60).nullish(),
});

const DriverFields = z.object({
  city: City,
  vehicle: z.enum(VEHICLES),
  plateNumber: z.string().trim().max(20).nullish(),
});
const DriverCreate = DriverFields.extend({
  fullName: Name,
  phone: Phone,
  vehicle: DriverFields.shape.vehicle.default('motorcycle'),
});
const DriverUpdate = DriverFields.partial().extend({
  status: z.enum(DRIVER_STATUSES).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Back office ("لوحة الإدارة") under /v1/admin. Every request resolves the staff member first;
 * each route then checks one permission. Store employees are automatically scoped to their store.
 */
export async function adminRoutes(app: FastifyInstance) {
  app.decorateRequest('staff', null);
  app.addHook('preHandler', async (req) => {
    req.staff = await loadStaff(app.ctx(req));
  });
  // Commission figures are for the general manager only: strip them for everyone else.
  app.addHook('preSerialization', async (req, _reply, payload) => {
    const staff = req.staff;
    if (!staff || staff.permissions.has('finance.view')) return payload;
    return redactFinance(payload);
  });

  const can = (req: FastifyRequest, permission: Permission) => {
    const staff = req.staff!;
    requirePermission(staff, permission);
    return staff;
  };

  app.get('/me', async (req) => {
    const s = req.staff!;
    return {
      id: s.userId,
      fullName: s.fullName,
      role: { key: s.roleKey, name: s.roleName },
      store: s.storeId ? { id: s.storeId, name: s.storeName } : null,
      permissions: [...s.permissions],
    };
  });

  app.get('/dashboard', async (req) => getDashboard(app.ctx(req), can(req, 'dashboard.view')));

  // ------------------------------------------------------------ stores
  app.get('/stores', async (req) => {
    const q = z.object({ status: z.enum(STORE_STATUSES).optional(), q: z.string().max(60).optional() }).parse(req.query);
    return { items: await listStores(app.ctx(req), can(req, 'stores.read'), { status: q.status, search: q.q }) };
  });
  app.post('/stores', async (req, reply) => {
    const staff = can(req, 'stores.write');
    const body = StoreCreate.parse(req.body);
    reply.status(201);
    return createStore(app.ctx(req), staff, body);
  });
  app.patch('/stores/:id', async (req) => {
    const staff = can(req, 'stores.write');
    const { id } = IdParams.parse(req.params);
    return updateStore(app.ctx(req), staff, id, StoreUpdate.parse(req.body));
  });

  // ------------------------------------------------------------ a store's own settings
  app.get('/my-store', async (req) => {
    const staff = can(req, 'store.profile');
    if (!staff.storeId) return { store: null };
    return { store: await getStore(app.db, staff.storeId) };
  });
  app.patch('/my-store', async (req) => {
    const staff = can(req, 'store.profile');
    return { store: await updateOwnStore(app.ctx(req), staff, StoreProfile.parse(req.body)) };
  });

  // ------------------------------------------------------------ products & sizes
  // ------------------------------------------------------------ photo uploads
  // The body is the image itself (Content-Type: image/*), not multipart: simpler for the browser and
  // no file parsing library. The purpose decides the permission.
  app.addContentTypeParser(/^image\//, { parseAs: 'buffer', bodyLimit: app.config.media.maxBytes + 1 }, (_req, body, done) =>
    done(null, body),
  );
  const UPLOAD_PERMISSION: Record<MediaPurpose, Permission> = {
    product: 'products.write',
    banner: 'banners.manage',
    look: 'looks.manage',
    category: 'categories.manage',
  };
  const uploads = optionalLimiter(app.config.limits.enabled, app.config.limits.uploadsPerUserHour, 3_600_000);
  app.post('/uploads', async (req, reply) => {
    const { purpose } = z.object({ purpose: z.enum(['product', 'banner', 'look', 'category']) }).parse(req.query);
    const staff = can(req, UPLOAD_PERMISSION[purpose]);
    enforceLimit(uploads, staff.userId, reply, 'upload_limit', 'صور كثيرة خلال ساعة، حاولي بعد قليل');
    if (!Buffer.isBuffer(req.body)) {
      throw badRequest('image_required', 'أرسلي الصورة نفسها (JPG أو PNG أو WebP)');
    }
    const ctx = app.ctx(req);
    const img = await storeImage(app.media, req.body, purpose, ctx.now, app.config.media.maxBytes);
    const { rows } = await ctx.db.query(
      `INSERT INTO media (purpose, store_id, storage, key, url, width, height, bytes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [purpose, staff.storeId, app.media.driver, img.key, img.url, img.width, img.height, img.bytes, staff.userId],
    );
    reply.status(201);
    return { id: rows[0].id as string, ...img };
  });

  // ------------------------------------------------------------ reviews (التقييمات) — moderation
  app.get('/reviews', async (req) => {
    can(req, 'reviews.manage');
    const q = z
      .object({
        hidden: z.enum(['true', 'false']).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    return listAdminReviews(app.db, {
      hidden: q.hidden === undefined ? undefined : q.hidden === 'true',
      limit: q.limit,
      offset: q.offset,
    });
  });

  app.post('/reviews/:id/visibility', async (req) => {
    const staff = can(req, 'reviews.manage');
    const { id } = IdParams.parse(req.params);
    const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
    return setReviewHidden(app.db, staff.userId, id, hidden);
  });

  // ------------------------------------------------------------ banners (البنرات)
  app.get('/banners', async (req) => {
    can(req, 'banners.manage');
    return { items: await listBanners(app.ctx(req)) };
  });
  app.post('/banners', async (req, reply) => {
    const staff = can(req, 'banners.manage');
    reply.status(201);
    return createBanner(app.ctx(req), staff, BannerCreate.parse(req.body));
  });
  app.patch('/banners/:id', async (req) => {
    can(req, 'banners.manage');
    const { id } = IdParams.parse(req.params);
    return updateBanner(app.ctx(req), id, BannerUpdate.parse(req.body));
  });
  app.delete('/banners/:id', async (req) => {
    can(req, 'banners.manage');
    const { id } = IdParams.parse(req.params);
    return deleteBanner(app.ctx(req), id);
  });
  app.post('/banners/reorder', async (req) => {
    can(req, 'banners.manage');
    const { ids } = z.object({ ids: z.array(Id).min(1).max(100) }).parse(req.body);
    return { items: await reorderBanners(app.ctx(req), ids) };
  });

  // ------------------------------------------------------------ looks («كمّل اللوك»)
  app.get('/looks', async (req) => {
    const staff = can(req, 'looks.manage');
    const q = z.object({ storeId: Id.optional() }).parse(req.query);
    return { items: await listAdminLooks(app.ctx(req), staff, q) };
  });
  app.get('/looks/:id', async (req) => {
    const staff = can(req, 'looks.manage');
    const { id } = IdParams.parse(req.params);
    return getAdminLook(app.ctx(req), staff, id);
  });
  app.post('/looks', async (req, reply) => {
    const staff = can(req, 'looks.manage');
    reply.status(201);
    return createLook(app.ctx(req), staff, LookCreate.parse(req.body));
  });
  app.patch('/looks/:id', async (req) => {
    const staff = can(req, 'looks.manage');
    const { id } = IdParams.parse(req.params);
    return updateLook(app.ctx(req), staff, id, LookUpdate.parse(req.body));
  });
  app.delete('/looks/:id', async (req) => {
    const staff = can(req, 'looks.manage');
    const { id } = IdParams.parse(req.params);
    return deleteLook(app.ctx(req), staff, id);
  });
  app.post('/looks/reorder', async (req) => {
    const staff = can(req, 'looks.manage');
    if (staff.storeId) throw forbidden('ترتيب اللوكات في الصفحة الرئيسية من فريق ستايلو');
    const { ids } = z.object({ ids: z.array(Id).min(1).max(500) }).parse(req.body);
    return { items: await reorderLooks(app.ctx(req), staff, ids) };
  });

  // ------------------------------------------------------------ categories (الأقسام)
  app.get('/categories', async (req) => {
    // Managers see every category; staff filing products see the visible ones.
    const staff = req.staff!;
    if (!staff.permissions.has('categories.manage')) requirePermission(staff, 'products.read');
    return { items: await listAdminCategories(app.ctx(req), staff) };
  });
  app.post('/categories', async (req, reply) => {
    can(req, 'categories.manage');
    reply.status(201);
    return createCategory(app.ctx(req), CategoryCreate.parse(req.body));
  });
  app.patch('/categories/:id', async (req) => {
    can(req, 'categories.manage');
    const { id } = IdParams.parse(req.params);
    return updateCategory(app.ctx(req), id, CategoryUpdate.parse(req.body));
  });
  app.delete('/categories/:id', async (req) => {
    can(req, 'categories.manage');
    const { id } = IdParams.parse(req.params);
    return deleteCategory(app.ctx(req), id);
  });
  app.post('/categories/reorder', async (req) => {
    const staff = can(req, 'categories.manage');
    const body = z.object({ parentId: Id.nullable(), ids: z.array(Id).min(1).max(200) }).parse(req.body);
    await reorderCategories(app.ctx(req), body);
    return { items: await listAdminCategories(app.ctx(req), staff) };
  });

  // ------------------------------------------------------------ products & sizes
  app.get('/products', async (req) => {
    const staff = can(req, 'products.read');
    const q = z
      .object({
        status: z.enum(PRODUCT_STATUSES).optional(),
        storeId: Id.optional(),
        categoryId: Id.optional(),
        q: z.string().trim().max(60).optional(),
        lowStock: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);
    return {
      items: await listProducts(app.ctx(req), staff, { ...q, search: q.q, lowStock: q.lowStock === 'true' }),
    };
  });
  app.get('/products/:id', async (req) => {
    const staff = can(req, 'products.read');
    const { id } = IdParams.parse(req.params);
    return getProduct(app.ctx(req), staff, id);
  });
  app.post('/products', async (req, reply) => {
    const staff = can(req, 'products.write');
    reply.status(201);
    return createProduct(app.ctx(req), staff, ProductBody.parse(req.body));
  });
  app.put('/products/:id', async (req) => {
    const staff = can(req, 'products.write');
    const { id } = IdParams.parse(req.params);
    return updateProduct(app.ctx(req), staff, id, ProductBody.parse(req.body));
  });

  // ------------------------------------------------------------ payouts (تسوية المستحقات)
  app.get('/payouts/balances', async (req) => ({ items: await listBalances(app.ctx(req), can(req, 'payouts.read')) }));
  app.get('/payouts/preview', async (req) => {
    const staff = can(req, 'payouts.manage');
    const q = z.object({ storeId: Id, from: Day, to: Day }).parse(req.query);
    return previewPayout(app.ctx(req), staff, q);
  });
  app.get('/payouts', async (req) => {
    const staff = can(req, 'payouts.read');
    const q = z.object({ storeId: Id.optional(), status: z.enum(['pending', 'paid']).optional() }).parse(req.query);
    return { items: await listPayouts(app.ctx(req), staff, q) };
  });
  app.get('/payouts/:id', async (req) => {
    const staff = can(req, 'payouts.read');
    const { id } = IdParams.parse(req.params);
    return getPayout(app.ctx(req), staff, id);
  });
  app.post('/payouts', async (req, reply) => {
    const staff = can(req, 'payouts.manage');
    const body = z
      .object({ storeId: Id, from: Day, to: Day, note: z.string().trim().max(300).optional() })
      .parse(req.body);
    reply.status(201);
    return createPayout(app.ctx(req), staff, body);
  });
  app.post('/payouts/:id/paid', async (req) => {
    const staff = can(req, 'payouts.manage');
    const { id } = IdParams.parse(req.params);
    const body = z
      .object({ reference: z.string().trim().min(2).max(80), note: z.string().trim().max(300).optional() })
      .parse(req.body);
    return markPayoutPaid(app.ctx(req), staff, id, body);
  });
  app.delete('/payouts/:id', async (req) => {
    can(req, 'payouts.manage');
    const { id } = IdParams.parse(req.params);
    return cancelPayout(app.ctx(req), id);
  });

  // ------------------------------------------------------------ driver cash custody (عُهدة المناديب)
  app.get('/custody', async (req) => {
    can(req, 'custody.read');
    return listCustody(app.ctx(req));
  });
  app.get('/custody/settlements', async (req) => {
    can(req, 'custody.read');
    const q = z
      .object({ driverId: Id.optional(), limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query);
    return { items: await listSettlements(app.ctx(req), q) };
  });
  app.get('/custody/settlements/:id', async (req) => {
    const staff = can(req, 'custody.read');
    const { id } = IdParams.parse(req.params);
    return getSettlement(app.ctx(req), staff, id);
  });
  app.get('/custody/:id', async (req) => {
    const staff = can(req, 'custody.read');
    const { id } = IdParams.parse(req.params);
    return getDriverCustody(app.ctx(req), staff, id);
  });
  app.post('/custody/:id/settle', async (req, reply) => {
    const staff = can(req, 'custody.manage');
    const { id } = IdParams.parse(req.params);
    const body = z
      .object({
        amountReceived: z.number().int().min(0).max(1_000_000_000),
        expectedAmount: z.number().int().min(0).optional(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(req.body);
    reply.status(201);
    return settleCustody(app.ctx(req), staff, { driverId: id, ...body });
  });

  // ------------------------------------------------------------ reports
  app.get('/reports', async (req) => {
    const staff = can(req, 'reports.view');
    const q = z.object({ from: Day.optional(), to: Day.optional(), storeId: Id.optional() }).parse(req.query);
    return getReport(app.ctx(req), staff, q);
  });

  // ------------------------------------------------------------ staff & roles
  app.get('/roles', async (req) => {
    can(req, 'staff.read');
    return { items: await listRoles(app.ctx(req)), permissions: PERMISSIONS };
  });
  app.get('/staff', async (req) => {
    can(req, 'staff.read');
    return { items: await listStaff(app.ctx(req)) };
  });
  app.post('/staff', async (req, reply) => {
    const staff = can(req, 'staff.write');
    reply.status(201);
    return createStaff(app.ctx(req), staff, StaffBody.parse(req.body));
  });
  app.patch('/staff/:id', async (req) => {
    const staff = can(req, 'staff.write');
    const { id } = IdParams.parse(req.params);
    const body = z
      .object({
        roleKey: z.string().min(2).max(40).optional(),
        storeId: Id.nullish(),
        jobTitle: z.string().trim().max(60).nullish(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    return updateStaff(app.ctx(req), staff, id, body);
  });

  // ------------------------------------------------------------ drivers
  app.get('/drivers', async (req) => {
    can(req, 'drivers.read');
    const q = z.object({ status: z.enum(DRIVER_STATUSES).optional(), city: z.string().max(40).optional() }).parse(req.query);
    return { items: await listDrivers(app.ctx(req), q) };
  });
  app.post('/drivers', async (req, reply) => {
    const staff = can(req, 'drivers.write');
    reply.status(201);
    return createDriver(app.ctx(req), staff, DriverCreate.parse(req.body));
  });
  app.patch('/drivers/:id', async (req) => {
    can(req, 'drivers.write');
    const { id } = IdParams.parse(req.params);
    return updateDriver(app.ctx(req), id, DriverUpdate.parse(req.body));
  });

  // ------------------------------------------------------------ orders
  app.get('/orders', async (req) => {
    const staff = can(req, 'orders.read');
    const q = z
      .object({
        status: z.enum(ORDER_STATUSES).optional(),
        storeId: Id.optional(),
        q: z.string().trim().max(60).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    return listOrders(app.ctx(req), staff, { ...q, search: q.q });
  });
  app.get('/orders/:id', async (req) => {
    const staff = can(req, 'orders.read');
    const { id } = IdParams.parse(req.params);
    return getOrder(app.ctx(req), staff, id);
  });
  app.post('/orders/:id/status', async (req) => {
    const staff = can(req, 'orders.update_status');
    const { id } = IdParams.parse(req.params);
    const body = z
      .object({
        to: z.enum(ORDER_STATUSES),
        note: z.string().trim().max(200).optional(),
        cancelReason: z.string().trim().max(200).optional(),
        /** Required for shipped → cancelled (failed delivery). */
        failureReason: z.enum(DELIVERY_FAILURE_KEYS).optional(),
      })
      .parse(req.body);
    const order = await changeOrderStatus(app.ctx(req), staff, id, body);
    notifyOrderStatus(app, id);
    return order;
  });
  app.post('/orders/:id/driver', async (req) => {
    const staff = can(req, 'orders.assign_driver');
    const { id } = IdParams.parse(req.params);
    const { driverId } = z.object({ driverId: Id }).parse(req.body);
    return assignDriver(app.ctx(req), staff, id, driverId);
  });
}
