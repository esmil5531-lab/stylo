// Visual tokens taken from the approved Stylo reference design (burgundy brand, soft pink accents).
export const colors = {
  primary: '#7A1F3D',
  primaryDark: '#5E1730',
  primarySoft: '#F8E9EE',
  heroBackground: '#F4DFE6',
  ink: '#1C1C1E',
  inkMuted: '#8A8A8E',
  inkFaint: '#B9B4B7',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F6F3F4',
  border: '#EEE6E9',
  success: '#2E7D4F',
  successSoft: '#E6F4EC',
  star: '#F2A93B',
  danger: '#C0392B',
  dangerSoft: '#FBEAE8',
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
    shadowColor: '#7A1F3D',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;
