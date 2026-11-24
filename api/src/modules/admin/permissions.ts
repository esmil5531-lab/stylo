import type { Ctx } from '../../lib/context.js';
import { forbidden, unauthorized } from '../../lib/errors.js';

/**
 * Back-office permissions. Roles (table `staff_roles`) are lists of these keys.
 * This list is the source of truth: adding a key here makes it assignable.
 */
export const PERMISSIONS = {
  'dashboard.view': 'عرض لوحة المؤشرات',
  'stores.read': 'عرض المتاجر',
  'stores.write': 'إضافة وتعديل المتاجر',
  'staff.read': 'عرض الموظفين',
  'staff.write': 'إضافة وتعديل الموظفين وأدوارهم',
  'drivers.read': 'عرض السائقين',
  'drivers.write': 'إضافة وتعديل السائقين وحالتهم',
  'orders.read': 'عرض الطلبات',
  'orders.update_status': 'تغيير حالة الطلب',
  'orders.assign_driver': 'إسناد الطلب لسائق',
  'products.read': 'عرض المنتجات',
  'products.write': 'إضافة وتعديل المنتجات والمقاسات',
  'store.profile': 'تعديل إعدادات متجره',
  'reports.view': 'عرض التقارير والأرباح',
  'stores.commission': 'تحديد نسبة عمولة المتاجر',
} as const;

export type Permission = keyof typeof PERMISSIONS;

/** The signed-in back-office user, resolved once per request. */
export interface StaffContext {
  userId: string;
  fullName: string;
  roleKey: string;
  roleName: string;
  permissions: Set<Permission>;
  /** Set for store employees: they only ever see this store's data. */
  storeId: string | null;
  storeName: string | null;
}

export async function loadStaff(ctx: Ctx): Promise<StaffContext> {
  if (!ctx.userId) throw unauthorized();
  const { rows } = await ctx.db.query(
    `SELECT u.id, u.full_name, sm.role_key, sm.store_id, sm.is_active,
            r.name_ar AS role_name, r.permissions, s.name_ar AS store_name
       FROM staff_members sm
       JOIN users u ON u.id = sm.user_id
       JOIN staff_roles r ON r.key = sm.role_key
       LEFT JOIN stores s ON s.id = sm.store_id
      WHERE sm.user_id = $1`,
    [ctx.userId],
  );
  const r = rows[0];
  if (!r || !r.is_active) throw forbidden('هذا الحساب ليس لديه وصول إلى لوحة الإدارة');
  return {
    userId: r.id,
    fullName: r.full_name,
    roleKey: r.role_key,
    roleName: r.role_name,
    permissions: new Set((r.permissions as string[]).filter((p): p is Permission => p in PERMISSIONS)),
    storeId: r.store_id,
    storeName: r.store_name,
  };
}

export function requirePermission(staff: StaffContext, permission: Permission): void {
  if (!staff.permissions.has(permission)) throw forbidden();
}
