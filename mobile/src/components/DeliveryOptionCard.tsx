import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DeliveryOption } from '@/api/types';
import { ar } from '@/i18n/ar';
import { arrivalLabel, formatPrice } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

/** Radio card for «أسرع توصيل» / «توصيل عادي». */
export function DeliveryOptionCard({
  option,
  selected,
  onSelect,
  currency,
}: {
  option: DeliveryOption;
  selected: boolean;
  onSelect: () => void;
  currency: string;
}) {
  const fastest = option.mode === 'fastest';
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.card, selected && styles.selected]}
    >
      <View style={[styles.icon, selected && { backgroundColor: colors.primary }]}>
        <MaterialCommunityIcons
          name={fastest ? 'lightning-bolt' : 'truck-outline'}
          size={20}
          color={selected ? colors.white : colors.primary}
        />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{fastest ? ar.delivery.fastest : ar.delivery.standard}</Text>
        <Text style={styles.hint}>{fastest ? ar.delivery.fastestHint : ar.delivery.standardHint}</Text>
        <View style={styles.meta}>
          <Text style={styles.eta}>{arrivalLabel(option.dayOffset)}</Text>
          <Text style={styles.fee}>{option.fee === 0 ? ar.delivery.free : formatPrice(option.fee, currency)}</Text>
        </View>
      </View>
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={22}
        color={selected ? colors.primary : colors.inkFaint}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  eta: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.secondary },
  fee: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
});
