import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ProductFacets, ProductSort } from '@/api/hooks';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { ar } from '@/i18n/ar';
import { formatPrice } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

const t = ar.products;
const SORTS: (ProductSort | undefined)[] = [undefined, 'newest', 'popular', 'discount', 'price_asc', 'price_desc'];

export interface ListFilters {
  sizes: string[];
  /** Dirhams. */
  minPrice?: number;
  maxPrice?: number;
}

export const activeFilterCount = (f: ListFilters) =>
  (f.sizes.length ? 1 : 0) + (f.minPrice !== undefined || f.maxPrice !== undefined ? 1 : 0);

/** «N منتج · ترتيب · فلترة (2)» bar above a product list. */
export function ListToolbar({
  total,
  sortLabel,
  filters,
  onSort,
  onFilter,
}: {
  total: number | undefined;
  sortLabel: string;
  filters: number;
  onSort: () => void;
  onFilter: () => void;
}) {
  return (
    <View style={styles.bar}>
      <Text style={styles.count}>{total !== undefined ? t.count(total) : ' '}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={onSort} accessibilityRole="button" accessibilityLabel={`${t.sort}: ${sortLabel}`}>
          <Ionicons name="swap-vertical" size={16} color={colors.ink} />
          <Text style={styles.actionText}>{t.sort}</Text>
        </Pressable>
        <View style={styles.sep} />
        <Pressable style={styles.action} onPress={onFilter} accessibilityRole="button">
          <Ionicons name="options-outline" size={16} color={colors.ink} />
          <Text style={styles.actionText}>{t.filter}</Text>
          {filters > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{filters}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export function SortSheet({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: ProductSort | undefined;
  onChange: (s: ProductSort | undefined) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={t.sort} onClose={onClose}>
      <View accessibilityRole="radiogroup">
        {SORTS.map((s) => {
          const on = s === value;
          return (
            <Pressable
              key={s ?? 'default'}
              style={styles.option}
              onPress={() => {
                onChange(s);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
            >
              <Text style={[styles.optionText, on && styles.optionOn]}>{t.sorts[s ?? 'default']}</Text>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.primary : colors.inkFaint} />
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/** Digits (Arabic-Indic too) → whole dinars → dirhams; empty = no limit. */
function parseDinars(text: string): number | undefined {
  const western = text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^\d]/g, '');
  return western ? Number(western) * 1000 : undefined;
}

export function FilterSheet({
  visible,
  facets,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  facets: ProductFacets | undefined;
  value: ListFilters;
  onApply: (f: ListFilters) => void;
  onClose: () => void;
}) {
  // Edited locally; applied with «عرض النتائج».
  const [sizes, setSizes] = useState<string[]>(value.sizes);
  const [min, setMin] = useState(value.minPrice !== undefined ? String(value.minPrice / 1000) : '');
  const [max, setMax] = useState(value.maxPrice !== undefined ? String(value.maxPrice / 1000) : '');
  const toggle = (s: string) => setSizes((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));

  return (
    <Sheet
      visible={visible}
      title={t.filter}
      onClose={onClose}
      footer={
        <>
          <Button
            title={t.reset}
            variant="outline"
            style={{ flex: 1 }}
            onPress={() => {
              setSizes([]);
              setMin('');
              setMax('');
            }}
          />
          <Button
            title={t.show('')}
            style={{ flex: 1.4 }}
            onPress={() => {
              onApply({ sizes, minPrice: parseDinars(min), maxPrice: parseDinars(max) });
              onClose();
            }}
          />
        </>
      }
    >
      <Text style={styles.h}>{t.sizes}</Text>
      {facets && facets.sizes.length > 0 ? (
        <View style={styles.chips}>
          {facets.sizes.map(({ size }) => {
            const on = sizes.includes(size);
            return (
              <Pressable
                key={size}
                onPress={() => toggle(size)}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{size}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.muted}>{t.noSizes}</Text>
      )}

      <Text style={styles.h}>{t.price}</Text>
      <View style={styles.priceRow}>
        <View style={styles.priceField}>
          <Text style={styles.muted}>{t.priceFrom}</Text>
          <TextInput value={min} onChangeText={setMin} keyboardType="number-pad" style={styles.input} maxLength={6} />
        </View>
        <View style={styles.priceField}>
          <Text style={styles.muted}>{t.priceTo}</Text>
          <TextInput value={max} onChangeText={setMax} keyboardType="number-pad" style={styles.input} maxLength={6} />
        </View>
      </View>
      {facets && facets.price.max > 0 && (
        <Text style={styles.muted}>{t.priceRange(formatPrice(facets.price.min), formatPrice(facets.price.max))}</Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  count: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 4 },
  actionText: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 22, color: colors.ink },
  sep: { width: 1, height: 18, backgroundColor: colors.border },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 16, color: colors.white },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 24, color: colors.ink },
  optionOn: { fontFamily: fonts.semiBold },
  h: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 24, color: colors.ink },
  muted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minWidth: 48,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 22, color: colors.ink },
  chipTextOn: { color: colors.white },
  priceRow: { flexDirection: 'row', gap: spacing.md },
  priceField: { flex: 1, gap: 4 },
  input: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
    writingDirection: 'ltr',
  },
});
