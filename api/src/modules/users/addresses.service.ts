import { inTransaction, type Queryable } from '../../db.js';
import { requireAccount, type Ctx } from '../../lib/context.js';
import { conflict, notFound } from '../../lib/errors.js';
import { normalisePhone } from '../../lib/phone.js';

/**
 * Customer delivery addresses («عناويني»). One address is the default: it prices delivery in the
 * cart and on product cards (the city decides same-city vs. intercity), and checkout uses it unless
 * another one is chosen. The first address is always the default; deleting the default promotes the
 * most recently used remaining one. Orders keep a snapshot, so editing/deleting never changes history.
 */

export const MAX_ADDRESSES = 10;

export interface AddressInput {
  label?: string | null;
  recipientName: string;
  phone: string;
  city: string;
  district?: string | null;
  street: string;
  building?: string | null;
  landmark?: string | null;
  isDefault?: boolean;
}

const SELECT = `SELECT id, label, recipient_name, phone, city, district, street, building, landmark, is_default,
                       created_at, updated_at FROM addresses`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAddress(r: any) {
  return {
    id: r.id as string,
    label: r.label as string | null,
    recipientName: r.recipient_name as string,
    phone: r.phone as string,
    city: r.city as string,
    district: r.district as string | null,
    street: r.street as string,
    building: r.building as string | null,
    landmark: r.landmark as string | null,
    isDefault: r.is_default as boolean,
  };
}

const clean = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

export async function listAddresses(ctx: Ctx) {
  const userId = requireAccount(ctx);
  const { rows } = await ctx.db.query(`${SELECT} WHERE user_id = $1 ORDER BY is_default DESC, updated_at DESC`, [
    userId,
  ]);
  return rows.map(mapAddress);
}

async function findOwn(db: Queryable, userId: string, id: string, lock = false) {
  const { rows } = await db.query(`${SELECT} WHERE id = $1 AND user_id = $2 ${lock ? 'FOR UPDATE' : ''}`, [
    id,
    userId,
  ]);
  if (!rows[0]) throw notFound('العنوان');
  return rows[0];
}

/** The partial unique index allows one default per user: clear the old one first. */
async function makeDefault(db: Queryable, userId: string, id: string) {
  await db.query(`UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default AND id <> $2`, [
    userId,
    id,
  ]);
  await db.query(`UPDATE addresses SET is_default = true WHERE id = $1 AND NOT is_default`, [id]);
}

export async function createAddress(ctx: Ctx, input: AddressInput) {
  const userId = requireAccount(ctx);
  const phone = normalisePhone(input.phone);
  const id = await inTransaction(ctx.db, async (db) => {
    // Serialise per user so the count and the "first is default" rule hold under double taps.
    await db.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM addresses WHERE user_id = $1`, [userId]);
    const count = rows[0].n as number;
    if (count >= MAX_ADDRESSES) {
      throw conflict('too_many_addresses', `يمكن حفظ ${MAX_ADDRESSES} عناوين كحد أقصى، احذفي عنواناً قديماً أولاً`);
    }
    const ins = await db.query(
      `INSERT INTO addresses (user_id, label, recipient_name, phone, country_code, city, district, street, building, landmark)
       VALUES ($1, $2, $3, $4, 'LY', $5, $6, $7, $8, $9) RETURNING id`,
      [
        userId,
        clean(input.label),
        input.recipientName.trim(),
        phone,
        input.city,
        clean(input.district),
        input.street.trim(),
        clean(input.building),
        clean(input.landmark),
      ],
    );
    const newId = ins.rows[0].id as string;
    if (count === 0 || input.isDefault) await makeDefault(db, userId, newId);
    return newId;
  });
  return mapAddress(await findOwn(ctx.db, userId, id));
}

export async function updateAddress(ctx: Ctx, id: string, input: Partial<AddressInput>) {
  const userId = requireAccount(ctx);
  await inTransaction(ctx.db, async (db) => {
    await findOwn(db, userId, id, true);
    const sets: string[] = [];
    const params: unknown[] = [id];
    const set = (col: string, value: unknown) => sets.push(`${col} = $${params.push(value)}`);
    if (input.label !== undefined) set('label', clean(input.label));
    if (input.recipientName !== undefined) set('recipient_name', input.recipientName.trim());
    if (input.phone !== undefined) set('phone', normalisePhone(input.phone));
    if (input.city !== undefined) set('city', input.city);
    if (input.district !== undefined) set('district', clean(input.district));
    if (input.street !== undefined) set('street', input.street.trim());
    if (input.building !== undefined) set('building', clean(input.building));
    if (input.landmark !== undefined) set('landmark', clean(input.landmark));
    if (sets.length) await db.query(`UPDATE addresses SET ${sets.join(', ')} WHERE id = $1`, params);
    if (input.isDefault) await makeDefault(db, userId, id);
  });
  return mapAddress(await findOwn(ctx.db, userId, id));
}

export async function setDefaultAddress(ctx: Ctx, id: string) {
  const userId = requireAccount(ctx);
  await inTransaction(ctx.db, async (db) => {
    await findOwn(db, userId, id, true);
    await makeDefault(db, userId, id);
  });
  return listAddresses(ctx);
}

export async function deleteAddress(ctx: Ctx, id: string) {
  const userId = requireAccount(ctx);
  await inTransaction(ctx.db, async (db) => {
    const row = await findOwn(db, userId, id, true);
    await db.query(`DELETE FROM addresses WHERE id = $1`, [id]);
    if (row.is_default) {
      // Keep one default while the customer has addresses.
      await db.query(
        `UPDATE addresses SET is_default = true
          WHERE id = (SELECT id FROM addresses WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1)`,
        [userId],
      );
    }
  });
  return listAddresses(ctx);
}

export async function updateProfile(ctx: Ctx, input: { fullName: string }) {
  const userId = requireAccount(ctx);
  const name = input.fullName.trim().replace(/\s+/g, ' ');
  await ctx.db.query(`UPDATE users SET full_name = $2 WHERE id = $1`, [userId, name]);
}
