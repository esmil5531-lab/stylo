// Shapes returned by /v1/admin (api/src/modules/admin). Money is in LYD dirhams (1 د.ل = 1000).

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type StoreStatus = 'pending_review' | 'active' | 'suspended';
export type DriverStatus = 'available' | 'busy' | 'offline';
export type Vehicle = 'motorcycle' | 'car' | 'van';

export type Permission =
  | 'dashboard.view'
  | 'stores.read'
  | 'stores.write'
  | 'staff.read'
  | 'staff.write'
  | 'drivers.read'
  | 'drivers.write'
  | 'orders.read'
  | 'orders.update_status'
  | 'orders.assign_driver'
  | 'products.read'
  | 'products.write'
  | 'store.profile'
  | 'reports.view'
  | 'stores.commission'
  | 'payouts.read'
  | 'payouts.manage'
  | 'categories.manage'
  | 'banners.manage'
  | 'looks.manage'
  | 'reviews.manage'
  | 'custody.read'
  | 'custody.manage'
  | 'finance.view';

export interface Me {
  id: string;
  fullName: string;
  role: { key: string; name: string };
  store: { id: string; name: string } | null;
  permissions: Permission[];
  serviceCities: string[];
}

export interface Dashboard {
  scope: { storeId: string; storeName: string } | null;
  ordersByStatus: Partial<Record<OrderStatus, number>>;
  today: { orders: number; sales: number; currency: string };
  stores: Partial<Record<StoreStatus, number>> | null;
  drivers: Partial<Record<DriverStatus, number>> | null;
}

export interface AdminStore {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  logoText: string | null;
  brandColor: string | null;
  city: string;
  /** false = outside the delivery area: hidden from customers. */
  inServiceArea: boolean;
  district: string | null;
  addressLine: string | null;
  phone: string | null;
  prepHours: number;
  deliveryFee: number;
  status: StoreStatus;
  isFeatured: boolean;
  commissionBps?: number;
  rating: number;
  createdAt: string;
  owner: { id: string; name: string; phone: string | null };
  productsCount: number;
  openOrders: number;
}

export interface Role {
  key: string;
  name: string;
  description: string | null;
  storeScoped: boolean;
  permissions: { key: Permission; label: string }[];
}

export interface StaffMember {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  role: { key: string; name: string };
  store: { id: string; name: string } | null;
  jobTitle: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Driver {
  id: string;
  fullName: string;
  phone: string | null;
  city: string;
  vehicle: Vehicle;
  plateNumber: string | null;
  status: DriverStatus;
  isActive: boolean;
  activeOrders: number;
  deliveredOrders: number;
  createdAt: string;
}

export interface AdminOrder {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  paymentStatus: string;
  currency: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  deliveryMode: string;
  city: string | null;
  placedAt: string;
  updatedAt: string;
  estimatedDeliveryAt: string | null;
  cancelReason: string | null;
  itemsCount: number;
  store: { id: string; name: string };
  customer: { id: string; name: string; phone: string | null };
  driver: { id: string; name: string; phone: string | null } | null;
}

export interface AdminOrderDetail extends AdminOrder {
  shippingAddress: Record<string, string>;
  items: {
    id: string;
    name: string;
    sku: string;
    size: string | null;
    colorName: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  history: { from: OrderStatus | null; to: OrderStatus; note: string | null; at: string; by: string | null }[];
  allowedNext: OrderStatus[];
}

// ---------------------------------------------------------------- 0005: store panel, products, reports

export type ProductStatus = 'draft' | 'active' | 'archived';

/** A category as the back office sees it (main categories, then their sub-categories). */
export interface Category {
  id: string;
  parentId: string | null;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  icon: string | null;
  color: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  totalProductCount: number;
  childrenCount: number;
}

export interface CategoryInput {
  nameAr: string;
  nameEn?: string | null;
  slug?: string | null;
  parentId?: string | null;
  icon?: string | null;
  color?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
}

export interface AdminProduct {
  id: string;
  nameAr: string;
  nameEn: string | null;
  brand: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  currency: string;
  status: ProductStatus;
  isFeatured: boolean;
  soldCount: number;
  rating: number;
  updatedAt: string;
  store: { id: string; name: string };
  category: { id: string; name: string } | null;
  imageUrl: string | null;
  colorHex: string | null;
  stockTotal: number;
  variantsCount: number;
  soldOutVariants: number;
  sizes: string[];
}

export interface AdminVariant {
  id: string;
  size: string | null;
  colorName: string | null;
  colorHex: string | null;
  sku: string;
  price: number | null;
  stock: number;
  position: number;
  sold: number;
}

export interface AdminProductDetail extends AdminProduct {
  descriptionAr: string | null;
  images: string[];
  variants: AdminVariant[];
}

export interface Report {
  range: { from: string; to: string; days: number };
  scope: { storeId: string } | null;
  currency: string;
  summary: {
    orders: number;
    delivered: number;
    cancelled: number;
    open: number;
    sales: number;
    commission?: number;
    deliveryFees: number;
    /** Absent for platform staff without finance.view. */
    storePayout?: number;
    styloRevenue?: number;
    realisedSales: number;
    realisedCommission?: number;
    cancelledSales: number;
    averageOrderValue: number;
    effectiveCommissionBps?: number;
    cancellationRateBps: number;
  };
  ordersByStatus: Partial<Record<OrderStatus, number>>;
  daily: { day: string; orders: number; sales: number; commission?: number }[];
  byStore: {
    storeId: string;
    storeName: string;
    currentCommissionBps?: number;
    orders: number;
    cancelled: number;
    sales: number;
    commission?: number;
    deliveryFees: number;
    payout?: number;
  }[];
  topProducts: { name: string; storeName: string; quantity: number; sales: number }[];
}

// ---------------------------------------------------------------- 0006: payouts

export interface StoreBalance {
  storeId: string;
  storeName: string;
  commissionBps?: number;
  unsettled: { orders: number; sales: number; commission?: number; payout: number; firstDay: string | null; lastDay: string | null };
  lastSettledTo: string | null;
  pendingAmount: number;
}

export interface PayoutPreview {
  storeId: string;
  from: string;
  to: string;
  ordersCount: number;
  sales: number;
  commission?: number;
  payout: number;
  orders: { id: string; orderNumber: number; deliveredAt: string; subtotal: number; commissionBps?: number; commission?: number; payout: number }[];
}

export interface Payout {
  id: string;
  number: number;
  store: { id: string; name: string };
  from: string;
  to: string;
  currency: string;
  ordersCount: number;
  sales: number;
  commission?: number;
  payoutAmount: number;
  status: 'pending' | 'paid';
  note: string | null;
  reference: string | null;
  createdAt: string;
  createdBy: string | null;
  paidAt: string | null;
  paidBy: string | null;
}

export interface PayoutDetail extends Payout {
  orders: { id: string; orderNumber: number; placedAt: string; subtotal: number; commissionBps?: number; commission?: number; payout: number }[];
}

// ---------------------------------------------------------------- 0007: driver cash custody
// Commission fields are only present for the general manager (finance.view).

export interface CustodyDriver {
  id: string;
  name: string;
  phone: string | null;
  city: string;
  vehicle: string;
  status: DriverStatus;
}

export interface CustodyRow {
  driver: CustodyDriver;
  ordersCount: number;
  storesCount: number;
  amount: number;
  since: string | null;
  lastSettlement: { at: string; amountReceived: number; receivedBy: string | null } | null;
}

export interface CustodyOrder {
  id: string;
  orderNumber: number;
  store: { id: string; name: string };
  customerName: string;
  collectedAt: string;
  total: number;
  subtotal?: number;
  deliveryFee?: number;
  commission?: number;
  storeNet: number;
}

export interface CustodyStoreLine {
  store: { id: string; name: string };
  ordersCount: number;
  collected: number;
  storeNet: number;
  deliveryFees?: number;
  commission?: number;
}

export interface CustodyBreakdown {
  orders: CustodyOrder[];
  byStore: CustodyStoreLine[];
  totals: { ordersCount: number; amount: number; storeNet: number; deliveryFees?: number; commission?: number };
}

export interface DriverCustody extends CustodyBreakdown {
  driver: CustodyDriver;
}

export interface Settlement {
  id: string;
  number: number;
  driver: { id: string; name: string; phone: string | null };
  ordersCount: number;
  amountExpected: number;
  amountReceived: number;
  difference: number;
  note: string | null;
  receivedBy: { id: string; name: string };
  settledAt: string;
}

export type SettlementDetail = Settlement & CustodyBreakdown;

// ---------------------------------------------------------------- 0010: banners & looks

export type BannerState = 'live' | 'scheduled' | 'expired' | 'hidden';

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  cta: string | null;
  imageUrl: string | null;
  /** In-app route, e.g. /products?feed=offers, /store/laura, /look/…, /product/<id>. */
  link: string | null;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  state: BannerState;
  /** Among the first 5 live banners actually shown on the home screen. */
  onHome: boolean;
  createdBy: string | null;
  updatedAt: string;
}

export interface BannerInput {
  title: string;
  subtitle?: string | null;
  cta?: string | null;
  imageUrl?: string | null;
  link?: string | null;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface AdminLook {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  updatedAt: string;
  store: { id: string; name: string };
  itemsCount: number;
  visibleItems: number;
  totalPrice: number;
  visibleToCustomers: boolean;
  hiddenReason: string | null;
}

export interface AdminLookDetail extends AdminLook {
  items: { id: string; name: string; price: number; status: string; imageUrl: string | null; colorHex: string | null; stock: number }[];
}

export interface LookInput {
  storeId?: string;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  isActive?: boolean;
  isFeatured?: boolean;
  productIds: string[];
}

export interface AdminReview {
  id: string;
  rating: number;
  body: string | null;
  hidden: boolean;
  createdAt: string;
  product: { id: string; name: string };
  storeName: string;
  customer: { name: string; phone: string | null };
}

/** «تنبيهات الطلبات» (GET /admin/alerts). */
export interface OrderAlerts {
  pending: { count: number; newestOrderNumber: number | null; newestAt: string | null };
  late: {
    count: number;
    minutes: number;
    items: { id: string; orderNumber: number; storeName: string; placedAt: string; waitingMinutes: number }[];
  };
  unassigned: { count: number; oldestAt: string | null } | null;
  autoCancelMinutes: number;
}
