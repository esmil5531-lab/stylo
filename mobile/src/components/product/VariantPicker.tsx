import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Variant } from '@/api/types';
import { ar } from '@/i18n/ar';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Size & colour selection. Sizes and colours come from the store's variants (in the order the
 * store set). A size is shown crossed out when it is sold out in the chosen colour.
 */
export function VariantPicker({
  variants,
  selected,
  onSelect,
}: {
  variants: Variant[];
  selected: Variant | undefined;
  onSelect: (variant: Variant | undefined) => void;
}) {
  const colorList = unique(variants.map((v) => v.colorName).filter((c): c is string => !!c));
  const sizeList = unique(variants.map((v) => v.size).filter((s): s is string => !!s));
  if (colorList.length <= 1 && sizeList.length <= 1) return null;

  const color = selected?.colorName ?? colorList[0] ?? null;
  const size = selected?.size ?? null;
  const find = (s: string | null, c: string | null) => variants.find((v) => v.size === s && v.colorName === c);

  const pickColor = (c: string) => {
    // Keep the size if it exists in the new colour, else the first in-stock size.
    const keep = find(size, c);
    onSelect(keep && keep.stock > 0 ? keep : variants.find((v) => v.colorName === c && v.stock > 0));
  };

  return (
    <View style={styles.wrap}>
      {colorList.length > 1 && (
        <View style={styles.group}>
          <Text style={styles.label}>
            {ar.product.color}: <Text style={styles.value}>{color}</Text>
          </Text>
          <View style={styles.row}>
            {colorList.map((c) => {
              const hex = variants.find((v) => v.colorName === c)?.colorHex ?? colors.inkFaint;
              const active = c === color;
              const anyStock = variants.some((v) => v.colorName === c && v.stock > 0);
              return (
                <Pressable
                  key={c}
                  onPress={() => pickColor(c)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active, disabled: !anyStock }}
                  accessibilityLabel={c}
                  style={[styles.swatchRing, active && styles.swatchRingActive, !anyStock && styles.out]}
                >
                  <View style={[styles.swatch, { backgroundColor: hex }]} />
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {sizeList.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.label}>
            {ar.product.size}
            {size ? (
              <>
                : <Text style={styles.value}>{size}</Text>
              </>
            ) : null}
          </Text>
          <View style={styles.row}>
            {sizeList.map((s) => {
              const v = find(s, colorList.length ? color : null);
              const out = !v || v.stock === 0;
              const active = v && selected?.id === v.id;
              return (
                <Pressable
                  key={s}
                  disabled={out}
                  onPress={() => onSelect(v)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: !!active, disabled: out }}
                  accessibilityLabel={out ? `${s} ${ar.product.soldOut}` : s}
                  style={[styles.chip, active && styles.chipActive, out && styles.out]}
                >
                  {/* Sizes are Latin (S, M, 38, 6Y): keep them LTR. A strike-through would turn
                      "L" into "Ł", so sold-out sizes get a small «نفد» caption instead. */}
                  <Text style={[styles.chipText, active && styles.chipTextActive, out && styles.outText]}>{s}</Text>
                  {out && <Text style={styles.soldOut}>{ar.product.soldOut}</Text>}
                </Pressable>
              );
            })}
          </View>
          {selected && selected.stock > 0 && selected.stock <= 2 && (
            <Text style={styles.low}>{ar.product.lowStock(selected.stock)}</Text>
          )}
        </View>
      )}
    </View>
  );
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list)];
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, marginTop: spacing.sm },
  group: { gap: spacing.sm },
  label: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  value: { fontFamily: fonts.semiBold, color: colors.inkMuted, writingDirection: 'ltr' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minWidth: 52,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink, writingDirection: 'ltr' },
  chipTextActive: { color: colors.primary },
  outText: { color: colors.inkMuted },
  soldOut: { fontFamily: fonts.semiBold, fontSize: 10, lineHeight: 14, color: colors.inkMuted },
  out: { backgroundColor: colors.surfaceMuted, borderStyle: 'dashed' },
  swatchRing: { padding: 3, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  swatchRingActive: { borderColor: colors.primary },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border },
  low: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.sale },
});
