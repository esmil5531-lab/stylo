function parse(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Mixes a color with white. amount 0 → original, 1 → white. */
export function lighten(hex: string, amount: number): string {
  const rgb = parse(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((c) => c + (255 - c) * amount) as [number, number, number];
  return toHex(r, g, b);
}

/** Relative luminance 0..1. */
export function luminance(hex: string): number {
  const rgb = parse(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mixes a color with black. amount 0 → original, 1 → black. */
export function darken(hex: string, amount: number): string {
  const rgb = parse(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((c) => c * (1 - amount)) as [number, number, number];
  return toHex(r, g, b);
}
