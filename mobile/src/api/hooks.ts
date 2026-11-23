import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  Me,
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

export const useCart = () => useQuery({ queryKey: queryKeys.cart, queryFn: () => api.get<Cart>('/cart') });

export const useSharedCart = (token: string) =>
  useQuery({ queryKey: queryKeys.sharedCart(token), queryFn: () => api.get<SharedCart>(`/shared-carts/${token}`) });

export const useOrders = () =>
  useQuery({
    queryKey: queryKeys.orders,
    queryFn: () => api.get<List<OrderSummary>>('/orders?limit=50').then((r) => r.items),
  });

export const useOrder = (id: string) =>
  useQuery({ queryKey: queryKeys.order(id), queryFn: () => api.get<OrderDetail>(`/orders/${id}`) });

export const useWishlist = () =>
  useQuery({
    queryKey: queryKeys.wishlist,
    queryFn: () => api.get<List<ProductSummary>>('/wishlist').then((r) => r.items),
  });

export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: () => api.get<Me>('/me') });

// ---------------------------------------------------------------- mutations
// Cart mutations return the full cart, so we write it straight into the cache.

function useCartMutation<V>(fn: (v: V) => Promise<Cart>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (cart) => qc.setQueryData(queryKeys.cart, cart) });
}

export const useAddToCart = () =>
  useCartMutation((v: { variantId: string; quantity?: number }) => api.post<Cart>('/cart/items', v));

export const useSetCartQuantity = () =>
  useCartMutation((v: { variantId: string; quantity: number }) =>
    api.patch<Cart>(`/cart/items/${v.variantId}`, { quantity: v.quantity }),
  );

export const useImportSharedCart = () =>
  useCartMutation((token: string) => api.post<Cart>(`/shared-carts/${token}/import`));

export const useAddLookToCart = () =>
  useCartMutation((lookId: string) =>
    api.post<{ cart: Cart }>(`/looks/${lookId}/add-to-cart`).then((r) => r.cart),
  );

export const useShareCart = () => useMutation({ mutationFn: () => api.post<ShareResult>('/cart/share') });

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { deliveryMode: DeliveryMode }) => api.post<CheckoutResult>('/checkout', v),
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
