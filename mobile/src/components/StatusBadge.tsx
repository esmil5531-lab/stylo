import { StyleSheet, Text, View } from 'react-native';

import { ORDER_STATUS_META, type OrderStatus } from '@/constants/orderStatus';
import { fonts, radius } from '@/theme';

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { labelAr, color } = ORDER_STATUS_META[status];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1A`, borderColor: `${color}55` }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{labelAr}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 13, fontFamily: fonts.semiBold },
});
