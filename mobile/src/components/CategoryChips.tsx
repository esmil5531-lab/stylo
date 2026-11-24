import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { Category } from '@/api/types';
import { ar } from '@/i18n/ar';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Sub-categories of a main category as pills («الكل · فساتين · عبايات…»), the same pill style as
 * the home tabs (FeedTabs). `value` is the selected category slug.
 */
export function CategoryChips({
  main,
  value,
  onChange,
}: {
  main: Category;
  value: string;
  onChange: (slug: string) => void;
}) {
  const options = [{ slug: main.slug, name: ar.categories.all }, ...main.children.map((c) => ({ slug: c.slug, name: c.name }))];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Without flexGrow: 0 a horizontal ScrollView fills the screen height (pills become huge).
      style={styles.scroll}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
      accessibilityLabel={ar.categories.subcategories}
    >
      {options.map((o) => {
        const active = o.slug === value;
        return (
          <Pressable
            key={o.slug}
            onPress={() => onChange(o.slug)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && styles.active]}
          >
            <Text style={[styles.text, active && styles.activeText]}>{o.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, alignItems: 'center' },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  active: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 22, color: colors.ink },
  activeText: { color: colors.white, fontFamily: fonts.bold },
});
