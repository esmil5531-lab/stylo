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
  pending: { labelAr: 'قيد الانتظار', color: '#9A7B4F' },
  confirmed: { labelAr: 'مؤكد', color: '#2F6FB0' },
  processing: { labelAr: 'قيد التجهيز', color: '#7A4FB0' },
  shipped: { labelAr: 'تم الشحن', color: '#B0702F' },
  delivered: { labelAr: 'تم التسليم', color: '#2F8A57' },
  cancelled: { labelAr: 'ملغي', color: '#B03A3A' },
};

// Same rules as order_status_can_transition() in the database.
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};
