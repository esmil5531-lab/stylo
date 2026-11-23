/** LYD has 3 decimals: amounts are stored in dirhams (1 د.ل = 1000). */
const DIRHAMS = 1000;

/** 199000 → "199 د.ل" · 12500 → "12.5 د.ل" */
export function formatLYD(dirhams: number): string {
  const value = dirhams / DIRHAMS;
  const [int, frac = ''] = value.toFixed(3).split('.');
  const trimmed = frac.replace(/0+$/, '');
  return `${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${trimmed ? `.${trimmed}` : ''} د.ل`;
}

/** "12.5" (د.ل typed by staff) → 12500 dirhams; null when not a valid amount. */
export function parseLYD(input: string): number | null {
  const normalised = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace('٫', '.')
    .replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(normalised)) return null;
  return Math.round(Number(normalised) * DIRHAMS);
}

export function dirhamsToInput(dirhams: number): string {
  return String(dirhams / DIRHAMS);
}

const dateFmt = new Intl.DateTimeFormat('ar-LY', {
  timeZone: 'Africa/Tripoli',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  numberingSystem: 'latn',
});

export function formatDateTime(iso: string): string {
  return dateFmt.format(new Date(iso));
}

/** "منذ 20 دقيقة" style relative time for order lists. */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return minutes === 1 ? 'منذ دقيقة' : minutes === 2 ? 'منذ دقيقتين' : `منذ ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'منذ ساعة' : hours === 2 ? 'منذ ساعتين' : `منذ ${hours} ساعات`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'منذ يوم' : days === 2 ? 'منذ يومين' : `منذ ${days} أيام`;
}
