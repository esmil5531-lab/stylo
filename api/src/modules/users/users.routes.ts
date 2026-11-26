import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { CITIES } from '../../lib/cities.js';
import { getServiceCities } from '../../lib/coverage.js';
import { IdParams } from '../../lib/validation.js';
import {
  createAddress,
  deleteAddress,
  listAddresses,
  setDefaultAddress,
  updateAddress,
  updateProfile,
} from './addresses.service.js';
import { deleteAccount, getMe } from './users.service.js';

const Optional = (max: number) => z.string().trim().max(max).nullish();

// Update schemas must not carry defaults (.partial() would apply them) — see CLAUDE.md.
const AddressFields = z.object({
  label: Optional(30),
  recipientName: z.string().trim().min(2, 'اكتبي اسم المستلم').max(80),
  phone: z.string().trim().min(9).max(20),
  city: z.enum(CITIES, { message: 'اختاري المدينة من القائمة' }),
  district: Optional(60),
  street: z.string().trim().min(2, 'اكتبي الشارع').max(160),
  building: Optional(60),
  landmark: Optional(120),
});
const AddressCreate = AddressFields.extend({ isDefault: z.boolean().optional() });
const AddressUpdate = AddressFields.partial().extend({ isDefault: z.literal(true).optional() });

export async function usersRoutes(app: FastifyInstance) {
  app.get('/me', async (req) => getMe(app.ctx(req)));

  /** «تعديل الاسم». */
  app.patch('/me', async (req) => {
    const body = z
      .object({ fullName: z.string().trim().min(2, 'الاسم قصير جداً').max(80, 'الاسم طويل جداً') })
      .parse(req.body);
    await updateProfile(app.ctx(req), body);
    return getMe(app.ctx(req));
  });

  /** Cities Stylo delivers to (the address city must be one of them). */
  /** «حذف حسابي»: erases the personal data (see deleteAccount). */
  app.delete('/me', async (req) => deleteAccount(app.ctx(req)));

  /** Every city an address may use, and the ones Stylo delivers to now (Tripoli at launch). */
  app.get('/cities', async () => ({ items: CITIES, served: await getServiceCities(app.db) }));

  // ------------------------------------------------------------ «عناويني»
  app.get('/me/addresses', async (req) => ({ items: await listAddresses(app.ctx(req)) }));

  app.post('/me/addresses', async (req, reply) => {
    const body = AddressCreate.parse(req.body);
    reply.status(201);
    return createAddress(app.ctx(req), body);
  });

  app.patch('/me/addresses/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    return updateAddress(app.ctx(req), id, AddressUpdate.parse(req.body));
  });

  app.post('/me/addresses/:id/default', async (req) => {
    const { id } = IdParams.parse(req.params);
    return { items: await setDefaultAddress(app.ctx(req), id) };
  });

  app.delete('/me/addresses/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    return { items: await deleteAddress(app.ctx(req), id) };
  });
}
