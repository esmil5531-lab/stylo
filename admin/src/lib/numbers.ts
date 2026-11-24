/**
 * Numbers in an RTL interface: input normalisation and display helpers.
 * Staff may type Arabic-Indic (٠١٢…) or Persian (۰۱۲…) digits; we store Western digits.
 * Everything numeric is shown in Western digits (as in the approved design) and direction-isolated
 * by the <Num>/<Phone> components so "#100001", "+218…", "12.5%" never get reordered.
 */

export function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

/** "0912345678" / "+218912345678" / "٠٩١٢٣٤٥٦٧٨" → "+218912345678", or null if not a Libyan mobile. */
export function normaliseLibyanPhone(input: string): string | null {
  const digits = toWesternDigits(input).replace(/[^\d+]/g, '');
  const local = digits.replace(/^\+?218/, '').replace(/^0/, '');
  return /^9[1-5]\d{7}$/.test(local) ? `+218${local}` : null;
}

/** "+218912345678" → "+218 91 234 5678" (display only). */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const m = /^\+218(\d{2})(\d{3})(\d{4})$/.exec(phone);
  return m ? `+218 ${m[1]} ${m[2]} ${m[3]}` : phone;
}

const intFmt = new Intl.NumberFormat('en-US');

/** 12345 → "12,345" */
export function formatInt(n: number): string {
  return intFmt.format(n);
}

/** Basis points → "12%" / "12.5%" */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

/** "12.5" (percent typed by staff) → 1250 bps, or null. */
export function parsePercent(input: string): number | null {
  const v = toWesternDigits(input).trim().replace('%', '');
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

/** Whole number in [min, max] typed by staff, or null. */
export function parseIntInput(input: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  const v = toWesternDigits(input).trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}
