/**
 * Libyan IBAN («رقم الآيبان»): LY + 2 check digits + 21 digits (bank, branch, account) = 25 characters,
 * validated with the ISO 13616 mod-97 check — a mistyped digit is caught before money is sent.
 */
const ARABIC_DIGITS = /[٠-٩]/g;

export function normaliseIban(input: string): string {
  return input
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

export function isValidLibyanIban(iban: string): boolean {
  if (!/^LY\d{23}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
