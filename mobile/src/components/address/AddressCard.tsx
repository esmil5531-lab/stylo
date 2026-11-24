import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Address } from '@/api/types';
import { ar } from '@/i18n/ar';
import { colors, fonts, radius, spacing } from '@/theme';

/** "+218912345678" → "+218 91 234 5678" (kept left-to-right by the caller). */
export function prettyPhone(p: string): string {
  const m = /^\+218(\d{2})(\d{3})(\d{4})$/.exec(p);
  return m ? `+218 ${m[1]} ${m[2]} ${m[3]}` : p;
}

/** One-line summary: «طرابلس، حي الأندلس، شارع جرابة». */
export function addressLine(a: Pick<Address, 'city' | 'district' | 'street'>): string {
  return [a.city, a.district, a.street].filter(Boolean).join('، ');
}

export function AddressCard({
  address: a,
  selected,
  onPress,
  footer,
}: {
  address: Address;
  /** Highlighted (e.g. the address the cart delivers to). */
  selected?: boolean;
  onPress?: () => void;
  footer?: ReactNode;
}) {
  const body = (
    <>
      <View style={styles.head}>
        <Ionicons
          name={a.label === 'الشغل' ? 'briefcase-outline' : 'home-outline'}
          size={18}
          color={colors.primary}
        />
        <Text style={styles.label}>{a.label ?? a.city}</Text>
        {a.isDefault && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{ar.addresses.default}</Text>
          </View>
        )}
        {selected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} style={styles.check} />}
      </View>
      <Text style={styles.line}>{addressLine(a)}</Text>
      {(a.building || a.landmark) && (
        <Text style={styles.muted}>{[a.building, a.landmark].filter(Boolean).join(' · ')}</Text>
      )}
      <Text style={styles.muted}>
        {a.recipientName} · <Text style={styles.ltr}>{prettyPhone(a.phone)}</Text>
      </Text>
      {footer}
    </>
  );
  // A plain container when not tappable: a disabled Pressable would mark the buttons inside it
  // (edit / delete) as disabled for screen readers.
  if (!onPress) return <View style={[styles.card, selected && styles.selected]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.85 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 24, color: colors.ink },
  badge: { backgroundColor: colors.successSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
  badgeText: { fontFamily: fonts.semiBold, fontSize: 11, lineHeight: 18, color: colors.success },
  check: { marginStart: 'auto' },
  line: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 22, color: colors.inkSecondary },
  muted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  ltr: { writingDirection: 'ltr' },
});
