import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/components/StatusBadge';
import { ORDER_STATUSES, ORDER_STATUS_META, ORDER_STATUS_TRANSITIONS } from '@/constants/orderStatus';
import { ar } from '@/i18n/ar';
import { colors, fonts, radius, spacing } from '@/theme';

export default function OrdersScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{ar.orders.statusesTitle}</Text>
      {ORDER_STATUSES.map((status, i) => {
        const next = ORDER_STATUS_TRANSITIONS[status];
        return (
          <View key={status} style={styles.row}>
            <Text style={styles.index}>{i + 1}</Text>
            <View style={{ flex: 1, gap: 6 }}>
              <StatusBadge status={status} />
              <Text style={styles.next}>
                {next.length
                  ? `${ar.orders.nextSteps}: ${next.map((n) => ORDER_STATUS_META[n].labelAr).join('، ')}`
                  : ar.orders.terminal}
              </Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 20, fontFamily: fonts.bold, color: colors.ink, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  index: { fontSize: 18, fontFamily: fonts.extraBold, color: colors.accent, width: 22, textAlign: 'center' },
  next: { fontSize: 13, fontFamily: fonts.regular, color: colors.inkMuted },
});
