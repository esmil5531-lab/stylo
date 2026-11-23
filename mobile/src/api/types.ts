// Response shapes of the Stylo API (api/src/modules/*). Money is always in minor units (LYD dirhams).

/** Home tabs: لأجلك · ترند · عروض · قريب منك (`new` is used by banner links). */
export type Feed = 'for_you' | 'trending' | 'offers' | 'nearby' | 'new';
/** أسرع توصيل · توصيل عادي */
export type DeliveryMode = 'fastest' | 'standard';

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
  /** Whole-percent discount for «عروض», else null. */
  discountPercent: number | null;
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
  /** Looks are curated per store, so a whole look fits one cart. */
  store: { id: string; slug: string; name: string; logoText: string; brandColor: string | null };
  items: ProductSummary[];
  totalPrice: number;
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

export interface DeliveryOption {
  mode: DeliveryMode;
  fee: number;
  arrivesAt: string;
  dayOffset: number;
}

export interface CartStore {
  id: string;
  slug: string;
  name: string;
  logoText: string;
  brandColor: string | null;
  city: string;
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
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  stock: number;
  issue: 'unavailable' | 'insufficient_stock' | null;
}

/** A cart always belongs to ONE store (null when empty). */
export interface Cart {
  store: CartStore | null;
  items: CartItem[];
  itemsCount: number;
  subtotal: number;
  currency: string;
  delivery: Record<DeliveryMode, DeliveryOption> | null;
  totals: Record<DeliveryMode, number> | null;
  hasIssues: boolean;
}

/** `details` of a 409 `cart_store_conflict`. */
export interface StoreConflict {
  currentStore: { id: string; slug: string; name: string };
  requestedStore: { id: string; slug: string; name: string };
  itemsCount: number;
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
  /** 'unified' only on orders placed before single-store carts. */
  deliveryMode: DeliveryMode | 'unified';
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
  id: string;
  orderNumber: number;
  store: CartStore;
  deliveryMode: DeliveryMode;
  currency: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  estimatedDeliveryAt: string;
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
