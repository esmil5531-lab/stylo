import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/theme';

export function QuantityStepper({
  value,
  max,
  onChange,
  disabled,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.wrap, disabled && { opacity: 0.5 }]}>
      <Pressable
        onPress={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        hitSlop={6}
        style={styles.btn}
        accessibilityLabel="زيادة الكمية"
      >
        <Ionicons name="add" size={16} color={value >= max ? colors.inkFaint : colors.ink} />
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable
        onPress={() => onChange(value - 1)}
        disabled={disabled}
        hitSlop={6}
        style={styles.btn}
        accessibilityLabel={value === 1 ? 'حذف' : 'تقليل الكمية'}
      >
        <Ionicons name={value === 1 ? 'trash-outline' : 'remove'} size={16} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  btn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 22, textAlign: 'center', fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
});
