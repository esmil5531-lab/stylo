import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/lib/session';

import { api, ApiError, ensureSession, query } from './client';
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
  DeliveryFailure,
  DriverOrder,
  DriverOrders,
  DriverStatus,
  NotificationItem,
  ProductReviews,
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
  notifications: ['notifications'] as const,
  order: (id: string) => ['orders', id] as const,
  wishlist: ['wishlist'] as const,
  me: ['me'] as const,
  driver: ['driver'] as const,
  addresses: ['addresses'] as const,
  cities: ['cities'] as const,
};

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'discount' | 'popular';

export interface ProductQuery {
  feed?: Feed;
  category?: string;
  store?: string;
  q?: string;
  limit?: number;
  /** «ترتيب»; without it the feed keeps its own order. */
  sort?: ProductSort;
  /** Sizes with stock (any of them). */
  sizes?: string[];
  /** Dirhams. */
  minPrice?: number;
  maxPrice?: number;
}

export interface ProductPage {
  items: ProductSummary[];
  total: number;
  hasMore: boolean;
}

export interface ProductFacets {
  sizes: { size: string; count: number }[];
  price: { min: number; max: number };
}

const productParams = (p: ProductQuery) => ({ ...p, sizes: p.sizes?.length ? p.sizes.join(',') : undefined });

// ---------------------------------------------------------------- queries

export const useHome = () => useQuery({ queryKey: queryKeys.home, queryFn: () => api.get<Home>('/home') });

export const useProducts = (p: ProductQuery) =>
  useQuery({
    queryKey: queryKeys.products(p),
    queryFn: () => api.get<ProductPage>(`/products${query(productParams(p))}`).then((r) => r.items),
  });

const PAGE = 20;

/** Paged results (product lists, search): 20 at a time, the next page loads on scroll. */
export const useProductPages = (p: Omit<ProductQuery, 'limit'>) =>
  useInfiniteQuery({
    queryKey: [...queryKeys.products(p), 'pages'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<ProductPage>(`/products${query({ ...productParams(p), limit: PAGE, offset: pageParam })}`),
    getNextPageParam: (last, all) => (last.hasMore ? all.length * PAGE : undefined),
  });

/** Sizes in stock and price range of a listing (the filter sheet). */
export const useProductFacets = (p: Pick<ProductQuery, 'feed' | 'category' | 'store' | 'q'>) =>
  useQuery({
    queryKey: ['products', 'facets', p],
    queryFn: () => api.get<ProductFacets>(`/products/facets${query({ ...p })}`),
    staleTime: 60_000,
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
/** The cart works for guests too (anonymous session created on the first add). */
export const useCart = () => {
  const { hasSession } = useSession();
  return useQuery({ queryKey: queryKeys.cart, queryFn: () => api.get<Cart>('/cart'), enabled: hasSession });
};

export const useSharedCart = (token: string) =>
  useQuery({ queryKey: queryKeys.sharedCart(token), queryFn: () => api.get<SharedCart>(`/shared-carts/${token}`) });

/** Latest updates of the customer's orders (the bell). Refreshed every 2 minutes while open. */
export const useNotifications = () =>
  useQuery({
    enabled: useSession().signedIn,
    queryKey: queryKeys.notifications,
    queryFn: () => api.get<{ items: NotificationItem[] }>('/me/notifications').then((r) => r.items),
    refetchInterval: 120_000,
  });

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
    enabled: useSession().hasSession,
    queryKey: queryKeys.wishlist,
    queryFn: () => api.get<List<ProductSummary>>('/wishlist').then((r) => r.items),
  });

export const useMe = () =>
  useQuery({ enabled: useSession().signedIn, queryKey: queryKeys.me, queryFn: () => api.get<Me>('/me') });

// ---------------------------------------------------------------- mutations
// Cart mutations return the full cart, so we write it straight into the cache.

function useCartMutation<V>(fn: (v: V) => Promise<Cart>) {
  const qc = useQueryClient();
  return useMutation({
    // No account needed: a guest session is created on first use.
    mutationFn: async (v: V) => {
      await ensureSession();
      return fn(v);
    },
    onSuccess: (cart) => qc.setQueryData(queryKeys.cart, cart),
  });
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

export const useShareCart = () =>
  useMutation({ mutationFn: () => ensureSession().then(() => api.post<ShareResult>('/cart/share')) });

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { deliveryMode: DeliveryMode; addressId?: string; expectedTotal?: number }) =>
      api.post<CheckoutResult>('/checkout', v),
    onError: (err) => {
      // A price or delivery fee changed since the cart was shown: show the new totals.
      if (err instanceof ApiError && err.code === 'price_changed') qc.invalidateQueries({ queryKey: queryKeys.cart });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cart });
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      qc.invalidateQueries({ queryKey: queryKeys.notifications });
      // Stock and "trending" changed.
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product'] });
    },
  });
}

/** «التقييمات» of a product (+ hers and whether she may write one). */
export const useProductReviews = (productId: string) => {
  const { signedIn } = useSession();
  return useQuery({
    // Signed-in state is part of the key: `mine` / `canReview` depend on who asks.
    queryKey: ['product', productId, 'reviews', signedIn],
    queryFn: () => api.get<ProductReviews>(`/products/${productId}/reviews?limit=10`),
  });
};

export function useSaveReview(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { rating: number; body?: string | null }) =>
      api.put<ProductReviews>(`/products/${productId}/reviews/mine`, v),
    // The product's rating changed too (cards, product page).
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product', productId] }),
  });
}

/** Cancel own order while «قيد الانتظار» (items go back to stock). */
export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reason?: string }) =>
      api.post<OrderDetail>(`/orders/${v.id}/cancel`, { reason: v.reason }),
    onSuccess: (order) => {
      qc.setQueryData(queryKeys.order(order.id), order);
      qc.invalidateQueries({ queryKey: queryKeys.orders });
      qc.invalidateQueries({ queryKey: queryKeys.notifications });
      qc.invalidateQueries({ queryKey: ['product'] });
    },
  });
}

/** Heart toggle; refreshes every list that shows the heart state. */
export function useToggleWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { productId: string; wishlisted: boolean }) => {
      await ensureSession(); // ♡ works for guests too
      return v.wishlisted ? api.put(`/wishlist/${v.productId}`) : api.delete(`/wishlist/${v.productId}`);
    },
    onSuccess: () => {
      for (const key of [queryKeys.wishlist, ['products'], ['product'], queryKeys.home, ['store'], ['look']]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// ---------------------------------------------------------------- driver mode
/** Driver endpoints are only called for a `driver` account (others would just get 403s). */
const useIsDriver = () => useMe().data?.role === 'driver';

export const useDriverHome = () =>
  useQuery({
    enabled: useIsDriver(),
    queryKey: [...queryKeys.driver, 'me'],
    queryFn: () => api.get<DriverHome>('/driver/me'),
    refetchInterval: 60_000,
  });

export const useDriverOrders = () =>
  useQuery({
    enabled: useIsDriver(),
    queryKey: [...queryKeys.driver, 'orders'],
    queryFn: () => api.get<DriverOrders>('/driver/orders'),
    // A newly assigned order shows (and vibrates) within 20 s while the app is open.
    refetchInterval: 20_000,
  });

function useDriverMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.driver }) });
}

export const useDriverPickUp = () =>
  useDriverMutation((id: string) => api.post<DriverOrder>(`/driver/orders/${id}/picked-up`));
export const useDriverDeliver = () =>
  useDriverMutation((id: string) => api.post<DriverOrder>(`/driver/orders/${id}/delivered`));
export const useDriverFail = () =>
  useDriverMutation((v: { id: string; reason: DeliveryFailure; note?: string }) =>
    api.post<DriverOrder>(`/driver/orders/${v.id}/failed`, { reason: v.reason, note: v.note }),
  );
export const useDriverStatus = () =>
  useDriverMutation((status: Exclude<DriverStatus, 'busy'>) => api.patch<DriverHome>('/driver/me/status', { status }));

// ---------------------------------------------------------------- «عناويني» and profile
export const useAddresses = () =>
  useQuery({
    enabled: useSession().signedIn,
    queryKey: queryKeys.addresses,
    queryFn: () => api.get<List<Address>>('/me/addresses').then((r) => r.items),
  });

/** Every address city, and the ones Stylo delivers to now (`served`, Tripoli at launch). */
export const useCities = () =>
  useQuery({
    queryKey: queryKeys.cities,
    queryFn: () => api.get<{ items: string[]; served: string[] }>('/cities'),
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
