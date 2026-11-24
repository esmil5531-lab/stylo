import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qs, request } from './client';
import type {
  CustodyRow,
  DriverCustody,
  Settlement,
  SettlementDetail,
  Payout,
  PayoutDetail,
  PayoutPreview,
  StoreBalance,
  AdminOrder,
  AdminProduct,
  AdminProductDetail,
  AdminLook,
  AdminLookDetail,
  Banner,
  BannerInput,
  Category,
  LookInput,
  CategoryInput,
  ProductStatus,
  Report,
  AdminOrderDetail,
  AdminStore,
  Dashboard,
  Driver,
  DriverStatus,
  Me,
  OrderStatus,
  Role,
  StaffMember,
  StoreStatus,
  Vehicle,
} from './types';

const get = <T>(path: string) => request<T>('GET', path);

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => get<Me>('/admin/me'), retry: false });

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => get<Dashboard>('/admin/dashboard'), refetchInterval: 30_000 });

// ---------------------------------------------------------------- orders
export interface OrderFilters {
  status?: OrderStatus;
  q?: string;
  storeId?: string;
  offset?: number;
}

export const useOrders = (f: OrderFilters) =>
  useQuery({
    queryKey: ['orders', f],
    queryFn: () =>
      get<{ items: AdminOrder[]; total: number }>(`/admin/orders${qs({ ...f, limit: 25 })}`),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

export const useOrder = (id: string) =>
  useQuery({ queryKey: ['order', id], queryFn: () => get<AdminOrderDetail>(`/admin/orders/${id}`) });

function useOrderMutation<V>(fn: (v: V) => Promise<AdminOrderDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (order) => {
      qc.setQueryData(['order', order.id], order);
      for (const key of [['orders'], ['dashboard'], ['drivers']]) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export const useChangeOrderStatus = (id: string) =>
  useOrderMutation((v: { to: OrderStatus; note?: string; cancelReason?: string }) =>
    request<AdminOrderDetail>('POST', `/admin/orders/${id}/status`, v),
  );

export const useAssignDriver = (id: string) =>
  useOrderMutation((driverId: string) =>
    request<AdminOrderDetail>('POST', `/admin/orders/${id}/driver`, { driverId }),
  );

// ---------------------------------------------------------------- stores
/** `enabled: false` for screens shown to staff without `stores.read` (e.g. store owners). */
export const useStores = (f: { status?: StoreStatus; q?: string } = {}, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ['stores', f],
    queryFn: () => get<{ items: AdminStore[] }>(`/admin/stores${qs(f)}`).then((r) => r.items),
  });

export interface StoreInput {
  nameAr: string;
  nameEn?: string | null;
  logoText?: string | null;
  city: string;
  district?: string | null;
  addressLine?: string | null;
  phone?: string | null;
  commissionBps?: number;
  deliveryFee: number;
  prepHours: number;
  status: StoreStatus;
  isFeatured: boolean;
  owner?: { fullName: string; phone: string; email?: string };
}

function useInvalidating<V, R>(fn: (v: V) => Promise<R>, keys: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })),
  });
}

export const useCreateStore = () =>
  useInvalidating((v: StoreInput) => request<AdminStore>('POST', '/admin/stores', v), [['stores'], ['dashboard']]);

export const useUpdateStore = () =>
  useInvalidating(
    ({ id, ...v }: Partial<StoreInput> & { id: string }) => request<AdminStore>('PATCH', `/admin/stores/${id}`, v),
    [['stores'], ['dashboard']],
  );

// ---------------------------------------------------------------- staff
export const useRoles = () =>
  useQuery({
    queryKey: ['roles'],
    queryFn: () => get<{ items: Role[] }>('/admin/roles').then((r) => r.items),
    staleTime: 5 * 60_000,
  });

export const useStaff = () =>
  useQuery({ queryKey: ['staff'], queryFn: () => get<{ items: StaffMember[] }>('/admin/staff').then((r) => r.items) });

export interface StaffInput {
  fullName: string;
  phone: string;
  email?: string;
  roleKey: string;
  storeId?: string | null;
  jobTitle?: string;
}

export const useCreateStaff = () =>
  useInvalidating((v: StaffInput) => request<StaffMember>('POST', '/admin/staff', v), [['staff']]);

export const useUpdateStaff = () =>
  useInvalidating(
    ({ id, ...v }: { id: string; roleKey?: string; storeId?: string | null; isActive?: boolean; jobTitle?: string }) =>
      request<StaffMember>('PATCH', `/admin/staff/${id}`, v),
    [['staff']],
  );

// ---------------------------------------------------------------- drivers
export const useDrivers = (f: { status?: DriverStatus; city?: string } = {}) =>
  useQuery({
    queryKey: ['drivers', f],
    queryFn: () => get<{ items: Driver[] }>(`/admin/drivers${qs(f)}`).then((r) => r.items),
  });

export interface DriverInput {
  fullName: string;
  phone: string;
  city: string;
  vehicle: Vehicle;
  plateNumber?: string;
}

export const useCreateDriver = () =>
  useInvalidating((v: DriverInput) => request<Driver>('POST', '/admin/drivers', v), [['drivers'], ['dashboard']]);

export const useUpdateDriver = () =>
  useInvalidating(
    ({ id, ...v }: { id: string; status?: DriverStatus; isActive?: boolean; city?: string; vehicle?: Vehicle }) =>
      request<Driver>('PATCH', `/admin/drivers/${id}`, v),
    [['drivers'], ['dashboard']],
  );

// ---------------------------------------------------------------- a store's own settings
export const useMyStore = () =>
  useQuery({
    queryKey: ['my-store'],
    queryFn: () => get<{ store: AdminStore | null }>('/admin/my-store').then((r) => r.store),
  });

export type StoreProfileInput = Pick<
  StoreInput,
  'nameAr' | 'nameEn' | 'logoText' | 'district' | 'addressLine' | 'phone' | 'prepHours'
>;

export const useUpdateMyStore = () =>
  useInvalidating(
    (v: Partial<StoreProfileInput>) => request<{ store: AdminStore }>('PATCH', '/admin/my-store', v),
    [['my-store'], ['stores']],
  );

// ---------------------------------------------------------------- products & sizes
export const useCategories = () =>
  useQuery({
    queryKey: ['categories'],
    queryFn: () => get<{ items: Category[] }>('/admin/categories').then((r) => r.items),
    staleTime: 60_000,
  });

// ---------------------------------------------------------------- categories (الأقسام)
export const useSaveCategory = () =>
  useInvalidating(
    ({ id, ...body }: Partial<CategoryInput> & { id?: string }) =>
      id ? request<Category>('PATCH', `/admin/categories/${id}`, body) : request<Category>('POST', '/admin/categories', body),
    [['categories'], ['products']],
  );

export const useDeleteCategory = () =>
  useInvalidating((id: string) => request<{ id: string }>('DELETE', `/admin/categories/${id}`), [['categories']]);

export const useReorderCategories = () =>
  useInvalidating(
    (v: { parentId: string | null; ids: string[] }) =>
      request<{ items: Category[] }>('POST', '/admin/categories/reorder', v),
    [['categories']],
  );

export interface ProductFilters {
  status?: ProductStatus;
  storeId?: string;
  q?: string;
  lowStock?: boolean;
}

export const useProducts = (f: ProductFilters) =>
  useQuery({
    queryKey: ['products', f],
    queryFn: () =>
      get<{ items: AdminProduct[] }>(
        `/admin/products${qs({ ...f, lowStock: f.lowStock ? 'true' : undefined })}`,
      ).then((r) => r.items),
    placeholderData: (prev) => prev,
  });

export const useProduct = (id: string | undefined) =>
  useQuery({
    queryKey: ['product', id],
    queryFn: () => get<AdminProductDetail>(`/admin/products/${id}`),
    enabled: !!id,
  });

export interface VariantInput {
  id?: string;
  size: string | null;
  colorName: string | null;
  colorHex: string | null;
  sku?: string | null;
  price?: number | null;
  stock: number;
}

export interface ProductInput {
  storeId?: string;
  categoryId: string | null;
  nameAr: string;
  nameEn: string | null;
  brand: string | null;
  descriptionAr: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  status: ProductStatus;
  isFeatured?: boolean;
  images: string[];
  variants: VariantInput[];
}

export function useSaveProduct(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ProductInput) =>
      id
        ? request<AdminProductDetail>('PUT', `/admin/products/${id}`, v)
        : request<AdminProductDetail>('POST', '/admin/products', v),
    onSuccess: (p) => {
      qc.setQueryData(['product', p.id], p);
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

// ---------------------------------------------------------------- reports
export const useReport = (f: { from?: string; to?: string; storeId?: string }) =>
  useQuery({
    queryKey: ['report', f],
    queryFn: () => get<Report>(`/admin/reports${qs(f)}`),
    placeholderData: (prev) => prev,
  });

// ---------------------------------------------------------------- payouts (تسوية المستحقات)
export const useBalances = () =>
  useQuery({
    queryKey: ['payouts', 'balances'],
    queryFn: () => get<{ items: StoreBalance[] }>('/admin/payouts/balances').then((r) => r.items),
  });

export const usePayouts = (f: { storeId?: string; status?: 'pending' | 'paid' } = {}) =>
  useQuery({
    queryKey: ['payouts', 'list', f],
    queryFn: () => get<{ items: Payout[] }>(`/admin/payouts${qs(f)}`).then((r) => r.items),
  });

export const usePayout = (id: string | null) =>
  useQuery({
    queryKey: ['payouts', 'one', id],
    queryFn: () => get<PayoutDetail>(`/admin/payouts/${id}`),
    enabled: !!id,
  });

export const usePayoutPreview = (q: { storeId: string; from: string; to: string } | null) =>
  useQuery({
    queryKey: ['payouts', 'preview', q],
    queryFn: () => get<PayoutPreview>(`/admin/payouts/preview${qs(q ?? {})}`),
    enabled: !!q && q.from <= q.to,
  });

export const useCreatePayout = () =>
  useInvalidating(
    (v: { storeId: string; from: string; to: string; note?: string }) => request<PayoutDetail>('POST', '/admin/payouts', v),
    [['payouts']],
  );

export const useMarkPaid = () =>
  useInvalidating(
    ({ id, ...v }: { id: string; reference: string; note?: string }) =>
      request<PayoutDetail>('POST', `/admin/payouts/${id}/paid`, v),
    [['payouts']],
  );

export const useCancelPayout = () =>
  useInvalidating((id: string) => request<{ id: string }>('DELETE', `/admin/payouts/${id}`), [['payouts']]);

// ---------------------------------------------------------------- driver cash custody (عُهدة المناديب)
export const useCustody = () =>
  useQuery({
    queryKey: ['custody', 'list'],
    queryFn: () => get<{ items: CustodyRow[]; total: number }>('/admin/custody'),
    refetchInterval: 60_000,
  });

export const useDriverCustody = (driverId: string | null) =>
  useQuery({
    queryKey: ['custody', 'driver', driverId],
    queryFn: () => get<DriverCustody>(`/admin/custody/${driverId}`),
    enabled: !!driverId,
  });

export const useSettlements = (f: { driverId?: string } = {}) =>
  useQuery({
    queryKey: ['custody', 'settlements', f],
    queryFn: () => get<{ items: Settlement[] }>(`/admin/custody/settlements${qs(f)}`).then((r) => r.items),
  });

export const useSettlement = (id: string | null) =>
  useQuery({
    queryKey: ['custody', 'settlement', id],
    queryFn: () => get<SettlementDetail>(`/admin/custody/settlements/${id}`),
    enabled: !!id,
  });

export const useSettleCustody = () =>
  useInvalidating(
    ({ driverId, ...v }: { driverId: string; amountReceived: number; expectedAmount: number; note?: string }) =>
      request<SettlementDetail>('POST', `/admin/custody/${driverId}/settle`, v),
    [['custody'], ['drivers']],
  );

// ---------------------------------------------------------------- banners (البنرات)
export const useBanners = () =>
  useQuery({ queryKey: ['banners'], queryFn: () => get<{ items: Banner[] }>('/admin/banners').then((r) => r.items) });

export const useSaveBanner = () =>
  useInvalidating(
    ({ id, ...body }: Partial<BannerInput> & { id?: string }) =>
      id ? request<Banner>('PATCH', `/admin/banners/${id}`, body) : request<Banner>('POST', '/admin/banners', body),
    [['banners']],
  );

export const useDeleteBanner = () =>
  useInvalidating((id: string) => request<{ id: string }>('DELETE', `/admin/banners/${id}`), [['banners']]);

export const useReorderBanners = () =>
  useInvalidating((ids: string[]) => request<{ items: Banner[] }>('POST', '/admin/banners/reorder', { ids }), [['banners']]);

// ---------------------------------------------------------------- looks («كمّل اللوك»)
export const useAdminLooks = (f: { storeId?: string } = {}, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ['looks', f],
    queryFn: () => get<{ items: AdminLook[] }>(`/admin/looks${qs(f)}`).then((r) => r.items),
  });

export const useAdminLook = (id: string | null) =>
  useQuery({
    queryKey: ['looks', 'one', id],
    queryFn: () => get<AdminLookDetail>(`/admin/looks/${id}`),
    enabled: !!id,
  });

export const useSaveLook = () =>
  useInvalidating(
    ({ id, ...body }: Partial<LookInput> & { id?: string }) =>
      id ? request<AdminLookDetail>('PATCH', `/admin/looks/${id}`, body) : request<AdminLookDetail>('POST', '/admin/looks', body),
    [['looks']],
  );

export const useDeleteLook = () =>
  useInvalidating((id: string) => request<{ id: string }>('DELETE', `/admin/looks/${id}`), [['looks']]);

export const useReorderLooks = () =>
  useInvalidating((ids: string[]) => request<{ items: AdminLook[] }>('POST', '/admin/looks/reorder', { ids }), [['looks']]);
