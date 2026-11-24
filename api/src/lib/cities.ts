/**
 * Cities Stylo delivers to. Address cities must be one of these exactly, because delivery fees
 * and times compare the store's city with the customer's (same city vs. intercity).
 * Mirrors LIBYAN_CITIES in admin/src/lib/constants.ts (stores pick from the same list).
 */
export const CITIES = [
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
] as const;
