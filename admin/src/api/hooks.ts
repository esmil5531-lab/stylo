import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qs, request } from './client';
import type {
  AdminOrder,
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
export const useStores = (f: { status?: StoreStatus; q?: string } = {}) =>
  useQuery({
    queryKey: ['stores', f],
    queryFn: () => get<{ items: AdminStore[] }>(`/admin/stores${qs(f)}`).then((r) => r.items),
  });

export interface StoreInput {
  nameAr: string;
  nameEn?: string | null;
  logoText?: string | null;
  city: string;
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
