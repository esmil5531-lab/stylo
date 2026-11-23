import type { DriverStatus, OrderStatus, StoreStatus, Vehicle } from '@/api/types';

/** The six order statuses — must mirror `order_status` in database/migrations/0001_init.sql. */
export const ORDER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone; action: string }> = {
  pending: { label: 'قيد الانتظار', tone: 'amber', action: '' },
  confirmed: { label: 'مؤكد', tone: 'blue', action: 'تأكيد الطلب' },
  processing: { label: 'قيد التجهيز', tone: 'violet', action: 'بدء التجهيز' },
  shipped: { label: 'تم الشحن', tone: 'orange', action: 'تسليم للسائق (تم الشحن)' },
  delivered: { label: 'تم التسليم', tone: 'green', action: 'تأكيد التسليم' },
  cancelled: { label: 'ملغي', tone: 'red', action: 'إلغاء الطلب' },
};

export const STORE_STATUS: Record<StoreStatus, { label: string; tone: Tone }> = {
  pending_review: { label: 'قيد المراجعة', tone: 'amber' },
  active: { label: 'نشط', tone: 'green' },
  suspended: { label: 'موقوف', tone: 'red' },
};

export const DRIVER_STATUS: Record<DriverStatus, { label: string; tone: Tone }> = {
  available: { label: 'متاح', tone: 'green' },
  busy: { label: 'في توصيلة', tone: 'orange' },
  offline: { label: 'غير متصل', tone: 'gray' },
};

export const VEHICLE: Record<Vehicle, string> = {
  motorcycle: 'دراجة نارية',
  car: 'سيارة',
  van: 'فان',
};

export const DELIVERY_MODE: Record<string, string> = {
  fastest: 'أسرع توصيل',
  standard: 'توصيل عادي',
  unified: 'توصيل موحد',
};

/** Libyan cities offered in forms (المنطقة). */
export const LIBYAN_CITIES = [
  'طرابلس',
  'بنغازي',
  'مصراتة',
  'الزاوية',
  'زليتن',
  'الخمس',
  'صبراتة',
  'غريان',
  'ترهونة',
  'سرت',
  'البيضاء',
  'درنة',
  'طبرق',
  'أجدابيا',
  'سبها',
];

export type Tone = 'amber' | 'blue' | 'violet' | 'orange' | 'green' | 'red' | 'gray' | 'brand';
