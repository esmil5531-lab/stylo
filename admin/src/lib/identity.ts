/**
 * TEMPORARY identity for development, until real staff login exists.
 * The API trusts the `x-user-id` header outside production; this lets you switch between
 * the seeded staff accounts to see how permissions change the dashboard.
 * In a production build there is no switcher and no default identity (the API answers 401).
 */
export const DEV_IDENTITIES = [
  { id: '00000000-0000-0000-0000-000000000001', label: 'مدير ستايلو — مدير عام' },
  { id: '00000000-0000-0000-0000-000000000006', label: 'أحمد الزوي — مدير عمليات' },
  { id: '00000000-0000-0000-0000-000000000007', label: 'هدى بن علي — خدمة العملاء' },
  { id: '00000000-0000-0000-0000-000000000008', label: 'ريم الترهوني — مديرة «أزياء لورا»' },
] as const;

const KEY = 'stylo-admin-dev-user';

export function getActingUserId(): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    return localStorage.getItem(KEY) ?? DEV_IDENTITIES[0].id;
  } catch {
    return DEV_IDENTITIES[0].id;
  }
}

export function setActingUserId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode: falls back to the default identity */
  }
}
