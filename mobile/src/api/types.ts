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
  /** Icon of the product's category (from «الأقسام» in the back office). */
  categoryIcon?: string | null;
  inStock: boolean;
  isWishlisted: boolean;
  store: StoreRef;
  /** null when the customer's address is outside the delivery area (Tripoli only at launch). */
  delivery: { arrivesAt: string; dayOffset: number } | null;
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
  /** Why it cannot be delivered to her address (outside the delivery area); null when it can. */
  coverageNote: string | null;
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
  /** MaterialCommunityIcons name chosen in the back office. */
  icon: string | null;
  /** Tile tint (#RRGGBB). */
  color: string | null;
  imageUrl: string | null;
  /** Visible products here and, for a main category, in its sub-categories. */
  productCount: number;
  children: Category[];
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
  /** Icon of the product's category (from «الأقسام» in the back office). */
  categoryIcon?: string | null;
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
  /** Outside the delivery area / store in another city: the message, and «إتمام الطلب» is blocked. */
  coverage: { code: 'outside_coverage' | 'store_other_city'; message: string; servedCities: string[] } | null;
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
  shippingAddress: {
    recipient_name: string;
    city: string;
    district?: string | null;
    street: string;
    building?: string | null;
    landmark?: string | null;
    phone: string;
  };
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

export interface Address {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  city: string;
  district: string | null;
  street: string;
  building: string | null;
  landmark: string | null;
  isDefault: boolean;
}

export type AddressInput = Omit<Address, 'id' | 'isDefault'> & { isDefault?: boolean };

export interface Me {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  defaultAddress: Address | null;
  addressesCount: number;
}

export interface List<T> {
  items: T[];
}

// ---------------------------------------------------------------- driver mode (/v1/driver)
// Drivers never receive commission or store dues — only what to collect.

export type DriverStatus = 'available' | 'busy' | 'offline';

export interface DriverHome {
  driver: { id: string; name: string; phone: string | null; city: string; vehicle: string; status: DriverStatus };
  custody: { ordersCount: number; amount: number; since: string | null };
  today: { delivered: number; active: number };
  /** Cash-on-delivery orders assigned and not delivered yet: what the driver will collect. */
  toCollect: { ordersCount: number; amount: number };
  lastSettlement: { at: string; amountReceived: number; receivedBy: string } | null;
}

export interface DriverOrder {
  id: string;
  orderNumber: number;
  status: OrderStatusValue;
  statusLabel: string;
  deliveryMode: 'fastest' | 'standard' | 'unified';
  isExpress: boolean;
  paymentMethod: 'cod' | 'online';
  amountToCollect: number;
  cashCollectedAt: string | null;
  placedAt: string;
  estimatedDeliveryAt: string | null;
  pickup: { storeName: string; phone: string | null; city: string; district: string | null; address: string | null };
  dropoff: {
    name: string;
    phone: string | null;
    city: string | null;
    district: string | null;
    street: string | null;
    building: string | null;
    landmark: string | null;
  };
  items: { name: string; size: string | null; color: string | null; quantity: number }[];
  canPickUp: boolean;
  canDeliver: boolean;
  /** «تعذّر التسليم» possible (parcel with the driver). */
  canFail: boolean;
  /** Failed delivery reason (for «أعِد إلى المتجر»). */
  failure: string | null;
}

export type DeliveryFailure = 'no_answer' | 'refused' | 'wrong_address' | 'postponed';

export interface DriverOrders {
  active: DriverOrder[];
  deliveredToday: DriverOrder[];
  /** Failed today: the pieces go back to the store. */
  returnToStore: DriverOrder[];
}

export interface NotificationItem {
  id: string;
  orderId: string;
  orderNumber: number;
  storeName: string;
  status: OrderStatusValue;
  /** Cancellation reason (only for cancelled). */
  note: string | null;
  at: string;
}

export interface Review {
  id: string;
  rating: number;
  body: string | null;
  author: string;
  createdAt: string;
  edited: boolean;
}

export interface ProductReviews {
  items: Review[];
  summary: { count: number; average: number; distribution: Record<'1' | '2' | '3' | '4' | '5', number> };
  /** Signed-in customer only. */
  mine: { rating: number; body: string | null; hidden: boolean } | null;
  /** She received this product (delivered order) and may rate it. */
  canReview: boolean;
}
