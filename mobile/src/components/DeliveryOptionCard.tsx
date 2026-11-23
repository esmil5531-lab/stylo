import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DeliveryOption } from '@/api/types';
import { ar } from '@/i18n/ar';
import { arrivalLabel, formatPrice } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

/** Radio card for "أسرع توصيل" / "توصيل موحد". */
export function DeliveryOptionCard({
  option,
  selected,
  onSelect,
  currency,
  savings = 0,
}: {
  option: DeliveryOption;
  selected: boolean;
  onSelect: () => void;
  currency: string;
  savings?: number;
}) {
  const fastest = option.mode === 'fastest';
  const disabled = !option.available;
  return (
    <Pressable
      onPress={onSelect}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      style={[styles.card, selected && styles.selected, disabled && styles.disabled]}
    >
      <View style={[styles.icon, selected && { backgroundColor: colors.primary }]}>
        <MaterialCommunityIcons
          name={fastest ? 'lightning-bolt' : 'package-variant-closed'}
          size={20}
          color={selected ? colors.white : colors.primary}
        />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{fastest ? ar.delivery.fastest : ar.delivery.unified}</Text>
          {!fastest && savings > 0 && (
            <View style={styles.save}>
              <Text style={styles.saveText}>{ar.delivery.save(formatPrice(savings, currency))}</Text>
            </View>
          )}
        </View>
        <Text style={styles.hint}>
          {disabled
            ? ar.delivery.unifiedUnavailable
            : fastest
              ? ar.delivery.fastestHint(option.shipments)
              : ar.delivery.unifiedHint}
        </Text>
        {!disabled && (
          <View style={styles.meta}>
            <Text style={styles.eta}>{arrivalLabel(option.dayOffset)}</Text>
            <Text style={styles.fee}>{option.fee === 0 ? ar.delivery.free : formatPrice(option.fee, currency)}</Text>
          </View>
        )}
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
  disabled: { opacity: 0.55 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  save: { backgroundColor: colors.successSoft, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  saveText: { fontFamily: fonts.semiBold, fontSize: 11, color: colors.success },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  eta: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.success },
  fee: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
});
