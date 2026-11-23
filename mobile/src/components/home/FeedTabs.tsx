import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Feed } from '@/api/types';
import { ar } from '@/i18n/ar';
import { colors, fonts, radius, spacing } from '@/theme';

export const FEED_ORDER: Feed[] = ['for_you', 'trending', 'offers', 'nearby'];

/** «لأجلك» (selected, burgundy pill) · «ترند» · «عروض» · «قريب منك» */
export function FeedTabs({ value, onChange }: { value: Feed; onChange: (f: Feed) => void }) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {FEED_ORDER.map((feed) => {
        const active = feed === value;
        return (
          <Pressable
            key={feed}
            onPress={() => onChange(feed)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.tab, active && styles.active]}
          >
            <Text style={[styles.text, active && styles.activeText]}>{ar.home.feeds[feed]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.md,
  },
  tab: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: radius.pill },
  active: { backgroundColor: colors.primary },
  text: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.ink },
  activeText: { color: colors.white, fontFamily: fonts.bold },
});
