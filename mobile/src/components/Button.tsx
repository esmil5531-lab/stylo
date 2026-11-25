import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius } from '@/theme';

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const primary = variant === 'primary';
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.outline,
        inactive && styles.disabled,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.white : colors.primary} />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, { color: primary ? colors.white : colors.primary }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // STYLO buttons: tailored 4 px corners, navy fill or a 1 px navy outline, 48 px tall.
  base: {
    minHeight: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
  },
  primary: { backgroundColor: colors.primary },
  outline: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.88 },
  text: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 22, letterSpacing: 0.2 },
});
