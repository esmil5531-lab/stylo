import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Feed } from '@/api/types';
import { ar } from '@/i18n/ar';
import { colors, fonts, spacing } from '@/theme';

export const FEED_ORDER: Feed[] = ['for_you', 'trending', 'offers', 'nearby'];

/** «لأجلك» · «ترند» · «عروض» · «قريب منك» — STYLO tabs: navy text, a 2 px navy line under the active one. */
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
    alignItems: 'flex-end',
    marginHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: { paddingHorizontal: 6, paddingTop: 6, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  active: { borderBottomColor: colors.primary },
  text: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.inkMuted },
  activeText: { color: colors.primary, fontFamily: fonts.semiBold },
});
