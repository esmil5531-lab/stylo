import { router } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Look } from '@/api/types';
import { ar } from '@/i18n/ar';
import { formatPrice } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

import { ProductImage } from './ProductImage';

/** "كمّل اللوك": the pieces of a look in a row, separated by "+", as in the reference. */
export function LookStrip({ look }: { look: Look }) {
  const currency = look.items[0]?.currency ?? 'LYD';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/look/[id]', params: { id: look.slug } })}
      style={styles.wrap}
    >
      <View style={styles.row}>
        {look.items.map((p, i) => (
          <Fragment key={p.id}>
            {i > 0 && <Text style={styles.plus}>+</Text>}
            <View style={styles.tile}>
              <ProductImage
                uri={p.imageUrl}
                colorHex={p.colorHex}
                category={p.category}
                name={p.name}
                iconSize={30}
              />
            </View>
          </Fragment>
        ))}
      </View>
      <View style={styles.footer}>
        <Text style={styles.title} numberOfLines={1}>
          {look.title}
        </Text>
        <Text style={styles.total}>
          {ar.home.lookTotal(formatPrice(look.totalPrice, currency))} · {ar.common.fromStores(look.storeCount)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tile: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 84,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  plus: { fontFamily: fonts.bold, fontSize: 18, color: colors.inkMuted, marginHorizontal: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  title: { flexShrink: 1, fontFamily: fonts.semiBold, fontSize: 13, color: colors.ink },
  total: { fontFamily: fonts.regular, fontSize: 12, color: colors.primary },
});
