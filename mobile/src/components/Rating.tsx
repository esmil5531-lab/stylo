import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

/** "★ 4.8 (320)" — nothing when there are no reviews yet (never «0.0»). */
export function Rating({ value, count, size = 12 }: { value: number; count?: number; size?: number }) {
  if (count === 0 || !value) return null;
  return (
    <View style={styles.row}>
      <Ionicons name="star" size={size} color={colors.star} />
      <Text style={[styles.value, { fontSize: size }]}>{value.toFixed(1)}</Text>
      {count != null && <Text style={[styles.count, { fontSize: size - 1 }]}>({count})</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  value: { fontFamily: fonts.bold, color: colors.ink },
  count: { fontFamily: fonts.regular, color: colors.inkMuted },
});
