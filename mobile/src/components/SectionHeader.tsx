import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ar } from '@/i18n/ar';
import { colors, fonts, spacing } from '@/theme';

export function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={styles.link}>{ar.common.seeAll}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  title: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink },
  link: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.primary },
});
