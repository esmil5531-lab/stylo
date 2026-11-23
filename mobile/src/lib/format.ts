import { ar } from '@/i18n/ar';

/** Decimal places per ISO currency. LYD uses dirhams: 1 د.ل = 1000. */
const MINOR_DIGITS: Record<string, number> = { LYD: 3, SAR: 2, USD: 2, EUR: 2 };
const SYMBOLS: Record<string, string> = { LYD: 'د.ل' };

function groupThousands(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 199000 (LYD) → "199 د.ل"; 12500 → "12.5 د.ل". Amounts always arrive in minor units. */
export function formatPrice(minor: number, currency = 'LYD'): string {
  const digits = MINOR_DIGITS[currency] ?? 2;
  const value = minor / 10 ** digits;
  const [int, frac = ''] = value.toFixed(digits).split('.');
  const trimmed = frac.replace(/0+$/, '');
  const amount = groupThousands(int!) + (trimmed ? `.${trimmed}` : '');
  return `${amount} ${SYMBOLS[currency] ?? currency}`;
}

/** 0 → "يصلك اليوم", 1 → "يصلك غداً", n → "يصلك خلال n أيام". */
export function arrivalLabel(dayOffset: number | null | undefined): string {
  if (dayOffset == null) return '';
  if (dayOffset <= 0) return ar.delivery.today;
  if (dayOffset === 1) return ar.delivery.tomorrow;
  return ar.delivery.inDays(dayOffset);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
}

/** «أسرع توصيل» · «توصيل عادي» · «توصيل موحد» (orders placed before single-store carts). */
export function deliveryModeLabel(mode: 'fastest' | 'standard' | 'unified'): string {
  return ar.delivery[mode];
}
