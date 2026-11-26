import type { Queryable } from '../../db.js';
import type { Ctx } from '../../lib/context.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { isValidLibyanIban, normaliseIban } from '../../lib/iban.js';
import type { StaffContext } from './permissions.js';

/**
 * Store bank account («الحساب البنكي») used for payouts.
 * - The store owner fills it in at «إعدادات متجري»; the general manager (stores.bank) can too.
 * - Any change clears the verification: before transferring to a NEW account the general manager
 *   checks it with the store (phone call, stamped letter…) and marks it «موثّق».
 * - Visible only to the store itself and to stores.bank holders (not to operations staff).
 */
export interface StoreBank {
  bankName: string | null;
  accountName: string | null;
  iban: string | null;
  accountNumber: string | null;
  complete: boolean;
  verified: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
}

export function canSeeBank(staff: StaffContext, storeId: string): boolean {
  return staff.permissions.has('stores.bank') || staff.storeId === storeId;
}

export async function getStoreBank(db: Queryable, storeId: string): Promise<StoreBank> {
  const { rows } = await db.query(
    `SELECT s.bank_name, s.bank_account_name, s.bank_iban, s.bank_account_number,
            s.bank_updated_at, s.bank_verified_at, ub.full_name AS updated_by, vb.full_name AS verified_by
       FROM stores s
       LEFT JOIN users ub ON ub.id = s.bank_updated_by
       LEFT JOIN users vb ON vb.id = s.bank_verified_by
      WHERE s.id = $1`,
    [storeId],
  );
  const r = rows[0];
  if (!r) throw notFound('المتجر');
  return {
    bankName: r.bank_name,
    accountName: r.bank_account_name,
    iban: r.bank_iban,
    accountNumber: r.bank_account_number,
    complete: !!(r.bank_name && r.bank_account_name && r.bank_iban),
    verified: !!r.bank_verified_at,
    updatedAt: r.bank_updated_at ? (r.bank_updated_at as Date).toISOString() : null,
    updatedBy: r.updated_by,
    verifiedAt: r.bank_verified_at ? (r.bank_verified_at as Date).toISOString() : null,
    verifiedBy: r.verified_by,
  };
}

export interface BankInput {
  bankName: string;
  accountName: string;
  iban: string;
  accountNumber?: string | null;
}

export async function updateStoreBank(ctx: Ctx, staff: StaffContext, storeId: string, input: BankInput): Promise<StoreBank> {
  const iban = normaliseIban(input.iban);
  if (!isValidLibyanIban(iban)) {
    throw badRequest('invalid_iban', 'رقم الآيبان غير صحيح: 25 خانة تبدأ بـ LY، تأكد من كل رقم', { field: 'iban' });
  }
  const accountNumber = input.accountNumber ? normaliseIban(input.accountNumber) : null;
  if (accountNumber && !/^\d{6,20}$/.test(accountNumber)) {
    throw badRequest('invalid_account_number', 'رقم الحساب أرقام فقط (6 إلى 20 رقماً)', { field: 'accountNumber' });
  }
  const { rowCount } = await ctx.db.query(
    `UPDATE stores SET bank_name = $2, bank_account_name = $3, bank_iban = $4, bank_account_number = $5,
            bank_updated_at = $6, bank_updated_by = $7,
            -- a changed account must be checked again before any transfer
            bank_verified_at = NULL, bank_verified_by = NULL
      WHERE id = $1`,
    [storeId, input.bankName.trim(), input.accountName.trim(), iban, accountNumber, ctx.now, staff.userId],
  );
  if (!rowCount) throw notFound('المتجر');
  return getStoreBank(ctx.db, storeId);
}

export async function verifyStoreBank(ctx: Ctx, staff: StaffContext, storeId: string): Promise<StoreBank> {
  const bank = await getStoreBank(ctx.db, storeId);
  if (!bank.complete) throw badRequest('bank_incomplete', 'أكمل بيانات الحساب البنكي قبل توثيقها');
  await ctx.db.query(`UPDATE stores SET bank_verified_at = $2, bank_verified_by = $3 WHERE id = $1`, [storeId, ctx.now, staff.userId]);
  return getStoreBank(ctx.db, storeId);
}
