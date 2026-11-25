// STYLO visual tokens — values come from brand/tokens.json (generated into ./tokens.ts).
// Deep Navy brand, Muted Teal accent, Soft Ivory backgrounds, Brushed Silver on navy only.
// Contrast (WCAG 2.1): navy on ivory 15.6:1 · white on navy 16.8:1 · teal on ivory 6.7:1 ·
// inkSecondary 7.0:1 · inkMuted on ivory 5.3:1 (4.8:1 on sand) · success on successSoft 5.5:1 ·
// sale on saleSoft 5.6:1 · white on sale 6.8:1 · inkFaint 3.0:1 (icons / disabled only, never text).
import { tokens } from './tokens';

const c = tokens.color;

export const colors = {
  primary: c.primary,
  /** Deepest navy: text on navy tints, pressed states on dark surfaces. */
  primaryDark: c.primaryDeep,
  primaryPressed: c.primaryPressed,
  /** Navy tint for selected chips and highlights. */
  primarySoft: c.primarySoft,
  /** Hero / banner background without a photo: deep navy (white + silver text on it). */
  heroBackground: c.primary,
  secondary: c.secondary,
  secondarySoft: c.secondarySoft,
  ink: c.ink,
  inkSecondary: c.inkSecondary,
  inkMuted: c.inkMuted,
  inkFaint: c.inkFaint,
  /** Screens: Soft Ivory. */
  background: c.background,
  /** Cards and sheets on ivory. */
  surface: c.surface,
  /** Sand: search field, chips, photo placeholders. */
  surfaceMuted: c.surfaceMuted,
  border: c.border,
  borderStrong: c.borderStrong,
  silver: c.silver,
  success: c.success,
  successSoft: c.successSoft,
  star: c.star,
  sale: c.sale,
  saleSoft: c.saleSoft,
  danger: c.danger,
  dangerSoft: c.dangerSoft,
  warning: c.warning,
  warningSoft: c.warningSoft,
  overlay: c.overlay,
  white: c.onPrimary,
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Tailored corners: buttons 4, cards 8, sheets 12. */
export const radius = { xs: tokens.radius.xs, sm: tokens.radius.sm, md: tokens.radius.md, lg: tokens.radius.lg, pill: 999 } as const;

// IBM Plex Sans Arabic — all UI text (its Latin matches). Cinzel — STYLO and store wordmarks.
// Playfair Display — English editorial titles only. Each weight is its own family (no fontWeight).
export const fonts = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semiBold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
  /** Plex has no 800: the heaviest weight is 700. */
  extraBold: 'IBMPlexSansArabic_700Bold',
  brand: 'Cinzel_500Medium',
  displayEn: 'PlayfairDisplay_400Regular',
} as const;

export const shadow = {
  card: {
    shadowColor: colors.primary,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
} as const;
