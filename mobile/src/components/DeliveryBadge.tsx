import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { arrivalLabel } from '@/lib/format';
import { colors, fonts, radius } from '@/theme';

/** Green "يصلك اليوم" pill with a truck, as on the reference product cards. */
export function DeliveryBadge({ dayOffset, compact }: { dayOffset: number; compact?: boolean }) {
  const fast = dayOffset <= 1;
  const tint = fast ? colors.success : colors.inkMuted;
  return (
    <View style={[styles.badge, { backgroundColor: fast ? colors.successSoft : colors.surfaceMuted }]}>
      <Text style={[styles.text, compact && styles.compact, { color: tint }]} numberOfLines={1}>
        {arrivalLabel(dayOffset)}
      </Text>
      <MaterialCommunityIcons name="truck-fast-outline" size={compact ? 13 : 15} color={tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: { fontFamily: fonts.semiBold, fontSize: 12 },
  compact: { fontSize: 11 },
});
