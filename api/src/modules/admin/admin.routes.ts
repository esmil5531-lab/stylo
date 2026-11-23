import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { Id, IdParams } from '../../lib/validation.js';
import { assignDriver, changeOrderStatus, getOrder, listOrders, ORDER_STATUSES } from './orders.admin.js';
import {
  createDriver,
  createStaff,
  createStore,
  DRIVER_STATUSES,
  getDashboard,
  listDrivers,
  listRoles,
  listStaff,
  listStores,
  STORE_STATUSES,
  updateDriver,
  updateStaff,
  updateStore,
  VEHICLES,
} from './people.admin.js';
import { loadStaff, PERMISSIONS, requirePermission, type Permission, type StaffContext } from './permissions.js';

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

// Update schemas must NOT carry defaults: zod's .partial() still applies them, which would
// silently reset fields the client did not send. Defaults live only on the create schemas.
const StoreFields = z.object({
  nameAr: Name,
  nameEn: z.string().trim().max(80).nullish(),
  logoText: z.string().trim().max(12).nullish(),
  city: City,
  deliveryFee: Dirhams,
  prepHours: z.number().int().min(0).max(72),
  status: z.enum(STORE_STATUSES),
  isFeatured: z.boolean(),
});
const StoreCreate = StoreFields.extend({
  prepHours: StoreFields.shape.prepHours.default(4),
  status: StoreFields.shape.status.default('pending_review'),
  isFeatured: StoreFields.shape.isFeatured.default(false),
  owner: z.object({ fullName: Name, phone: Phone, email: Email }),
});
const StoreUpdate = StoreFields.partial();

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
    can(req, 'stores.write');
    const { id } = IdParams.parse(req.params);
    return updateStore(app.ctx(req), id, StoreUpdate.parse(req.body));
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
      })
      .parse(req.body);
    return changeOrderStatus(app.ctx(req), staff, id, body);
  });
  app.post('/orders/:id/driver', async (req) => {
    const staff = can(req, 'orders.assign_driver');
    const { id } = IdParams.parse(req.params);
    const { driverId } = z.object({ driverId: Id }).parse(req.body);
    return assignDriver(app.ctx(req), staff, id, driverId);
  });
}
