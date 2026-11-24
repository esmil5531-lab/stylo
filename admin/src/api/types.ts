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
  | 'payouts.manage';

export interface Me {
  id: string;
  fullName: string;
  role: { key: string; name: string };
  store: { id: string; name: string } | null;
  permissions: Permission[];
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
  district: string | null;
  addressLine: string | null;
  phone: string | null;
  prepHours: number;
  deliveryFee: number;
  status: StoreStatus;
  isFeatured: boolean;
  commissionBps: number;
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

export interface Category {
  id: string;
  slug: string;
  name: string;
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
    commission: number;
    deliveryFees: number;
    storePayout: number;
    styloRevenue: number;
    realisedSales: number;
    realisedCommission: number;
    cancelledSales: number;
    averageOrderValue: number;
    effectiveCommissionBps: number;
    cancellationRateBps: number;
  };
  ordersByStatus: Partial<Record<OrderStatus, number>>;
  daily: { day: string; orders: number; sales: number; commission: number }[];
  byStore: {
    storeId: string;
    storeName: string;
    currentCommissionBps: number;
    orders: number;
    cancelled: number;
    sales: number;
    commission: number;
    deliveryFees: number;
    payout: number;
  }[];
  topProducts: { name: string; storeName: string; quantity: number; sales: number }[];
}

// ---------------------------------------------------------------- 0006: payouts

export interface StoreBalance {
  storeId: string;
  storeName: string;
  commissionBps: number;
  unsettled: { orders: number; sales: number; commission: number; payout: number; firstDay: string | null; lastDay: string | null };
  lastSettledTo: string | null;
  pendingAmount: number;
}

export interface PayoutPreview {
  storeId: string;
  from: string;
  to: string;
  ordersCount: number;
  sales: number;
  commission: number;
  payout: number;
  orders: { id: string; orderNumber: number; deliveredAt: string; subtotal: number; commissionBps: number; commission: number; payout: number }[];
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
  commission: number;
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
  orders: { id: string; orderNumber: number; placedAt: string; subtotal: number; commissionBps: number; commission: number; payout: number }[];
}
