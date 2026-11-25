// Must mirror the `order_status` enum in database/migrations/0001_init.sql.
export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_META: Record<OrderStatus, { labelAr: string; color: string }> = {
  pending: { labelAr: 'قيد الانتظار', color: '#8A5A00' },
  confirmed: { labelAr: 'مؤكد', color: '#2F5E8C' },
  processing: { labelAr: 'قيد التجهيز', color: '#5B4B8A' },
  shipped: { labelAr: 'تم الشحن', color: '#355E5A' },
  delivered: { labelAr: 'تم التسليم', color: '#2D6A4F' },
  cancelled: { labelAr: 'ملغي', color: '#9E3A2B' },
};

// Same rules as order_status_can_transition() in the database.
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'], // cancelled = failed delivery («تعذّر التسليم», reason required)
  delivered: [],
  cancelled: [],
};
