// Visual tokens from the approved Stylo reference design (deep burgundy brand, soft pink accents).
// Contrast (WCAG): primary on white 13.6:1 · inkMuted on white 6.5:1 · inkMuted on surfaceMuted 5.8:1
// · success on successSoft 5.7:1 · inkFaint on white 3.9:1 (decorative / strike-through / large only).
export const colors = {
  primary: '#5B0E2D',
  primaryDark: '#3F0820',
  primarySoft: '#F8EBEF',
  heroBackground: '#F4DFE6',
  ink: '#1A1A1C',
  inkSecondary: '#4E4A4D',
  inkMuted: '#625D60',
  inkFaint: '#857F82',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F1F2',
  border: '#E9DFE3',
  success: '#1E6B40',
  successSoft: '#E3F3E9',
  star: '#C77C00',
  sale: '#B3261E',
  saleSoft: '#FCE8E6',
  danger: '#B3261E',
  dangerSoft: '#FCE8E6',
  white: '#FFFFFF',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

// Cairo — Arabic UI typeface. Cinzel — the STYLO wordmark and store logo wordmarks.
// With custom fonts each weight is its own family, so use these instead of fontWeight.
export const fonts = {
  regular: 'Cairo_400Regular',
  semiBold: 'Cairo_600SemiBold',
  bold: 'Cairo_700Bold',
  extraBold: 'Cairo_800ExtraBold',
  brand: 'Cinzel_600SemiBold',
} as const;

export const shadow = {
  card: {
    shadowColor: colors.primary,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;
