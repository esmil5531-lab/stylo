import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ar } from '@/i18n/ar';
import { directionalIcons } from '@/i18n/rtl';
import { colors, fonts, spacing } from '@/theme';

/** Title bar for stack screens. The back arrow points right (RTL). */
export function ScreenHeader({ title, back = true, end }: { title: string; back?: boolean; end?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.side}>
        {back && (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={ar.common.back}
          >
            <Ionicons name={directionalIcons.back} size={24} color={colors.ink} />
          </Pressable>
        )}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.end]}>{end}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  side: { width: 44, flexDirection: 'row' },
  end: { justifyContent: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
});
