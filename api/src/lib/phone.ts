import { badRequest } from './errors.js';

/**
 * Libyan mobile numbers, normalised to +2189XXXXXXXX (Libyana 91/92/94/95, Al-Madar 91/93…).
 * Accepts 09…, 9…, +2189…, 002189… and Arabic-Indic (٠-٩) / Persian (۰-۹) digits.
 */
export function normalisePhone(raw: string): string {
  const western = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const digits = western.replace(/[^\d+]/g, '').replace(/^00/, '+');
  const local = digits.replace(/^\+?218/, '').replace(/^0/, '');
  if (!/^9[1-5]\d{7}$/.test(local)) {
    throw badRequest('invalid_phone', 'رقم الهاتف غير صحيح. مثال: 0912345678');
  }
  return `+218${local}`;
}
