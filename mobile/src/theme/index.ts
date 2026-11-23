export const colors = {
  ink: '#141414',
  inkMuted: '#6B6B6B',
  background: '#FAF8F5',
  surface: '#FFFFFF',
  border: '#ECE7E1',
  accent: '#B08A5B',
  accentSoft: '#F3EBE1',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

// Cairo — Arabic-first typeface. Loaded in src/app/_layout.tsx.
// With custom fonts each weight is its own family, so use these instead of fontWeight.
export const fonts = {
  regular: 'Cairo_400Regular',
  semiBold: 'Cairo_600SemiBold',
  bold: 'Cairo_700Bold',
  extraBold: 'Cairo_800ExtraBold',
} as const;
