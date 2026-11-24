import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/lib/session';

import { api, query } from './client';
import type {
  Cart,
  Category,
  CheckoutResult,
  DeliveryMode,
  Feed,
  Home,
  List,
  Look,
  DriverHome,
  DriverOrder,
  DriverOrders,
  DriverStatus,
  Me,
  Address,
  AddressInput,
  OrderDetail,
  OrderSummary,
  ProductDetail,
  ProductSummary,
  ShareResult,
  SharedCart,
  StoreDetail,
} from './types';

export const queryKeys = {
  home: ['home'] as const,
  products: (p: ProductQuery) => ['products', p] as const,
  product: (id: string) => ['product', id] as const,
  completeTheLook: (id: string) => ['product', id, 'complete-the-look'] as const,
  categories: ['categories'] as const,
  store: (slug: string) => ['store', slug] as const,
  look: (id: string) => ['look', id] as const,
  cart: ['cart'] as const,
  sharedCart: (token: string) => ['shared-cart', token] as const,
  orders: ['orders'] as const,
  order: (id: string) => ['orders', id] as const,
  wishlist: ['wishlist'] as const,
  me: ['me'] as const,
  driver: ['driver'] as const,
  addresses: ['addresses'] as const,
  cities: ['cities'] as const,
};

export interface ProductQuery {
  feed?: Feed;
  category?: string;
  store?: string;
  q?: string;
  limit?: number;
}

// ---------------------------------------------------------------- queries

export const useHome = () => useQuery({ queryKey: queryKeys.home, queryFn: () => api.get<Home>('/home') });

export const useProducts = (p: ProductQuery) =>
  useQuery({
    queryKey: queryKeys.products(p),
    queryFn: () => api.get<List<ProductSummary>>(`/products${query({ ...p })}`).then((r) => r.items),
  });

export const useProduct = (id: string) =>
  useQuery({ queryKey: queryKeys.product(id), queryFn: () => api.get<ProductDetail>(`/products/${id}`) });

export const useCompleteTheLook = (id: string) =>
  useQuery({
    queryKey: queryKeys.completeTheLook(id),
    queryFn: () => api.get<List<ProductSummary>>(`/products/${id}/complete-the-look`).then((r) => r.items),
  });

export const useCategories = () =>
  useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.get<List<Category>>('/categories').then((r) => r.items),
    staleTime: 10 * 60_000,
  });

export const useStore = (slug: string) =>
  useQuery({ queryKey: queryKeys.store(slug), queryFn: () => api.get<StoreDetail>(`/stores/${slug}`) });

export const useLook = (id: string) =>
  useQuery({ queryKey: queryKeys.look(id), queryFn: () => api.get<Look>(`/looks/${id}`) });

/** Signed-in customers only (the cart lives on the server). */
export const useCart = () => {
  const { signedIn } = useSession();
  return useQuery({ queryKey: queryKeys.cart, queryFn: () => api.get<Cart>('/cart'), enabled: signedIn });
};

export const useSharedCart = (token: string) =>
  useQuery({ queryKey: queryKeys.sharedCart(token), queryFn: () => api.get<SharedCart>(`/shared-carts/${token}`) });

export const useOrders = () =>
  useQuery({
    enabled: useSession().signedIn,
    queryKey: queryKeys.orders,
    queryFn: () => api.get<List<OrderSummary>>('/orders?limit=50').then((r) => r.items),
  });

export const useOrder = (id: string) =>
  useQuery({
    enabled: useSession().signedIn,
    queryKey: queryKeys.order(id),
    queryFn: () => api.get<OrderDetail>(`/orders/${id}`),
  });

export const useWishlist = () =>
  useQuery({
    enabled: useSession().signedIn,
    queryKey: queryKeys.wishlist,
    queryFn: () => api.get<List<ProductSummary>>('/wishlist').then((r) => r.items),
  });

export const useMe = () =>
  useQuery({ enabled: useSession().signedIn, queryKey: queryKeys.me, queryFn: () => api.get<Me>('/me') });

// ---------------------------------------------------------------- mutations
// Cart mutations return the full cart, so we write it straight into the cache.

function useCartMutation<V>(fn: (v: V) => Promise<Cart>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (cart) => qc.setQueryData(queryKeys.cart, cart) });
}

/** `replaceCart: true` empties a cart from another store and starts a new one (after asking). */
export const useAddToCart = () =>
  useCartMutation((v: { variantId: string; quantity?: number; replaceCart?: boolean }) =>
    api.post<Cart>('/cart/items', v),
  );

export const useSetCartQuantity = () =>
  useCartMutation((v: { variantId: string; quantity: number }) =>
    api.patch<Cart>(`/cart/items/${v.variantId}`, { quantity: v.quantity }),
  );

export const useImportSharedCart = () =>
  useCartMutation((v: { token: string; replaceCart?: boolean }) =>
    api.post<Cart>(`/shared-carts/${v.token}/import`, { replaceCart: v.replaceCart ?? false }),
  );

export const useAddLookToCart = () =>
  useCartMutation((v: { lookId: string; replaceCart?: boolean }) =>
    api
      .post<{ cart: Cart }>(`/looks/${v.lookId}/add-to-cart`, { replaceCart: v.replaceCart ?? false })
      .then((r) => r.cart),
  );

export const useShareCart = () => useMutation({ mutationFn: () => api.post<ShareResult>('/cart/share') });

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { deliveryMode: DeliveryMode; addressId?: string }) => api.post<CheckoutResult>('/checkout', v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cart });
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      // Stock and "trending" changed.
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product'] });
    },
  });
}

/** Heart toggle; refreshes every list that shows the heart state. */
export function useToggleWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { productId: string; wishlisted: boolean }) =>
      v.wishlisted ? api.put(`/wishlist/${v.productId}`) : api.delete(`/wishlist/${v.productId}`),
    onSuccess: () => {
      for (const key of [queryKeys.wishlist, ['products'], ['product'], queryKeys.home, ['store'], ['look']]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// ---------------------------------------------------------------- driver mode
export const useDriverHome = () =>
  useQuery({
    enabled: useSession().signedIn,
    queryKey: [...queryKeys.driver, 'me'],
    queryFn: () => api.get<DriverHome>('/driver/me'),
    refetchInterval: 60_000,
  });

export const useDriverOrders = () =>
  useQuery({
    enabled: useSession().signedIn,
    queryKey: [...queryKeys.driver, 'orders'],
    queryFn: () => api.get<DriverOrders>('/driver/orders'),
    refetchInterval: 30_000,
  });

function useDriverMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.driver }) });
}

export const useDriverPickUp = () =>
  useDriverMutation((id: string) => api.post<DriverOrder>(`/driver/orders/${id}/picked-up`));
export const useDriverDeliver = () =>
  useDriverMutation((id: string) => api.post<DriverOrder>(`/driver/orders/${id}/delivered`));
export const useDriverStatus = () =>
  useDriverMutation((status: Exclude<DriverStatus, 'busy'>) => api.patch<DriverHome>('/driver/me/status', { status }));

// ---------------------------------------------------------------- «عناويني» and profile
export const useAddresses = () =>
  useQuery({
    enabled: useSession().signedIn,
    queryKey: queryKeys.addresses,
    queryFn: () => api.get<List<Address>>('/me/addresses').then((r) => r.items),
  });

/** Cities Stylo delivers to (the address city is picked from this list). */
export const useCities = () =>
  useQuery({
    queryKey: queryKeys.cities,
    queryFn: () => api.get<{ items: string[] }>('/cities').then((r) => r.items),
    staleTime: 60 * 60_000,
  });

/**
 * The default address prices delivery everywhere (cart, product cards, looks), so any change to
 * addresses refreshes those too.
 */
function useAddressMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of [queryKeys.addresses, queryKeys.me, queryKeys.cart, ['products'], ['product'], ['home'], ['look']]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export const useSaveAddress = () =>
  useAddressMutation(({ id, ...body }: Partial<AddressInput> & { id?: string }) =>
    id ? api.patch<Address>(`/me/addresses/${id}`, body) : api.post<Address>('/me/addresses', body),
  );

export const useDeleteAddress = () =>
  useAddressMutation((id: string) => api.delete<List<Address>>(`/me/addresses/${id}`));

export const useSetDefaultAddress = () =>
  useAddressMutation((id: string) => api.post<List<Address>>(`/me/addresses/${id}/default`));

export function useUpdateName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fullName: string) => api.patch<Me>('/me', { fullName }),
    onSuccess: (me) => qc.setQueryData(queryKeys.me, me),
  });
}
