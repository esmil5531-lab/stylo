/** Size systems offered when adding a product. Staff can also type any custom size. */
export const SIZE_PRESETS: { key: string; label: string; sizes: string[] }[] = [
  { key: 'letters', label: 'ملابس (حروف)', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] },
  { key: 'eu', label: 'ملابس (أرقام)', sizes: ['34', '36', '38', '40', '42', '44', '46', '48'] },
  { key: 'shoes', label: 'أحذية', sizes: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'] },
  { key: 'kids', label: 'أطفال (بالعمر)', sizes: ['2Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y'] },
];

/** Common colours with their swatch; staff can add any other name + colour. */
export const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'أسود', hex: '#111111' },
  { name: 'أبيض', hex: '#F5F5F5' },
  { name: 'بيج', hex: '#E8DCCB' },
  { name: 'عنابي', hex: '#5B0E2D' },
  { name: 'كحلي', hex: '#1F2A44' },
  { name: 'رمادي', hex: '#8E8E8E' },
  { name: 'بني', hex: '#6B4226' },
  { name: 'وردي', hex: '#E8B4C0' },
  { name: 'أزرق', hex: '#5B7DA8' },
  { name: 'أخضر', hex: '#4F6F52' },
  { name: 'ذهبي', hex: '#C9A24B' },
  { name: 'فضي', hex: '#B8BCC2' },
];

/** Stock at or below this is flagged «كمية منخفضة». */
export const LOW_STOCK = 2;

export const PRODUCT_STATUS = {
  draft: { label: 'مسودة', tone: 'gray' as const, hint: 'لا يظهر للزبائن' },
  active: { label: 'معروض', tone: 'green' as const, hint: 'يظهر في التطبيق' },
  archived: { label: 'مؤرشف', tone: 'amber' as const, hint: 'مخفي ومحفوظ' },
};
