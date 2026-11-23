// Response shapes of the Stylo API (api/src/modules/*). Money is always in minor units (LYD dirhams).

export type Feed = 'for_you' | 'trending' | 'new' | 'nearby';
export type DeliveryMode = 'fastest' | 'unified';

export interface StoreRef {
  id: string;
  slug: string;
  name: string;
  city: string;
}

export interface ProductSummary {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  rating: number;
  ratingCount: number;
  imageUrl: string | null;
  colorHex: string | null;
  category: string | null;
  inStock: boolean;
  isWishlisted: boolean;
  store: StoreRef;
  delivery: { arrivesAt: string; dayOffset: number };
}

export interface Variant {
  id: string;
  sku: string;
  size: string | null;
  colorName: string | null;
  colorHex: string | null;
  price: number;
  stock: number;
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  images: { url: string; alt: string | null }[];
  variants: Variant[];
}

export interface Store {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  logoText: string;
  brandColor: string | null;
  city: string;
  prepHours: number;
  deliveryFee: number;
  rating: number;
  ratingCount: number;
  isFeatured: boolean;
}

export interface StoreDetail extends Store {
  products: ProductSummary[];
}

export interface Look {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  items: ProductSummary[];
  totalPrice: number;
  storeCount: number;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  cta: string | null;
  imageUrl: string | null;
  link: string | null;
}

export interface Home {
  banners: Banner[];
  featuredLook: Look | null;
  featuredStores: Store[];
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  productCount: number;
}

export interface StoreEta {
  storeId: string;
  fee: number;
  arrivesAt: string;
  dayOffset: number;
}

export interface DeliveryOption {
  mode: DeliveryMode;
  available: boolean;
  fee: number;
  shipments: number;
  arrivesAt: string | null;
  dayOffset: number | null;
  perStore: StoreEta[];
}

export interface CartItem {
  variantId: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  colorHex: string | null;
  colorName: string | null;
  size: string | null;
  category: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  stock: number;
  issue: 'unavailable' | 'insufficient_stock' | null;
}

export interface CartGroup {
  store: { id: string; slug: string; name: string; logoText: string; brandColor: string | null; city: string };
  items: CartItem[];
  itemsCount: number;
  subtotal: number;
  fastestShipment: StoreEta | null;
}

export interface Cart {
  groups: CartGroup[];
  itemsCount: number;
  storeCount: number;
  subtotal: number;
  currency: string;
  delivery: { fastest: DeliveryOption; unified: DeliveryOption & { savings: number } };
  totals: { fastest: number; unified: number };
  hasIssues: boolean;
}

export interface SharedCart {
  token: string;
  sharedBy: string;
  createdAt: string;
  expiresAt: string;
  cart: Cart;
}

export interface ShareResult {
  token: string;
  url: string;
  expiresAt: string;
}

export type OrderStatusValue = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderSummary {
  id: string;
  orderNumber: number;
  checkoutId: string;
  status: OrderStatusValue;
  paymentStatus: string;
  currency: string;
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  deliveryMode: DeliveryMode;
  estimatedDeliveryAt: string | null;
  placedAt: string;
  trackingNumber: string | null;
  cancelReason: string | null;
  itemsCount: number;
  store: { id: string; slug: string; name: string; logoText: string; brandColor: string | null };
}

export interface OrderDetail extends OrderSummary {
  shippingAddress: { recipient_name: string; city: string; district?: string; street: string; phone: string };
  items: {
    id: string;
    productId: string | null;
    name: string;
    sku: string;
    size: string | null;
    colorName: string | null;
    colorHex: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  history: { from: OrderStatusValue | null; to: OrderStatusValue; note: string | null; at: string }[];
}

export interface CheckoutResult {
  checkoutId: string;
  deliveryMode: DeliveryMode;
  currency: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  orders: {
    id: string;
    orderNumber: number;
    store: CartGroup['store'];
    total: number;
    shippingFee: number;
    estimatedDeliveryAt: string | null;
  }[];
}

export interface Me {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  defaultAddress: { id: string; label: string | null; city: string; district: string | null; street: string } | null;
}

export interface List<T> {
  items: T[];
}
