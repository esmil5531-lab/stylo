import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProductSummary } from '@/api/types';
import { ar } from '@/i18n/ar';
import { formatPrice } from '@/lib/format';
import { colors, fonts, radius, shadow } from '@/theme';

import { DeliveryBadge } from './DeliveryBadge';
import { ProductImage } from './ProductImage';
import { Rating } from './Rating';
import { WishlistButton } from './WishlistButton';

/**
 * Card from the reference: photo with a heart, rating, name, store, price and a delivery badge.
 * `width` for horizontal rails; omit it in grids (the card then fills its column).
 */
export function ProductCard({ product, width }: { product: ProductSummary; width?: number }) {
  return (
    <Pressable
      style={[styles.card, width ? { width } : styles.flex]}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })}
    >
      <View style={styles.imageWrap}>
        <ProductImage
          uri={product.imageUrl}
          colorHex={product.colorHex}
          category={product.category}
          icon={product.categoryIcon}
          name={product.name}
        />
        {product.discountPercent ? (
          <View style={styles.sale}>
            <Text style={styles.saleText}>{ar.product.discount(product.discountPercent)}</Text>
          </View>
        ) : null}
        <View style={styles.heart}>
          <WishlistButton productId={product.id} initial={product.isWishlisted} />
        </View>
      </View>
      <View style={styles.body}>
        <Rating value={product.rating} count={product.ratingCount} />
        <Text style={styles.name} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.store} numberOfLines={1}>
          {product.store.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPrice(product.price, product.currency)}</Text>
          {product.compareAtPrice ? (
            <Text style={styles.compare}>{formatPrice(product.compareAtPrice, product.currency)}</Text>
          ) : null}
        </View>
        {product.delivery && <DeliveryBadge dayOffset={product.delivery.dayOffset} compact />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  imageWrap: { aspectRatio: 0.92, backgroundColor: colors.surfaceMuted },
  heart: { position: 'absolute', top: 8, start: 8 },
  sale: {
    position: 'absolute',
    top: 10,
    end: 8,
    backgroundColor: colors.sale,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  // Latin digits + %: keep "-23%" in LTR order.
  saleText: { fontFamily: fonts.bold, fontSize: 11, color: colors.white, writingDirection: 'ltr' },
  body: { padding: 10, gap: 3 },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  store: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted, marginTop: -2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  price: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.ink },
  compare: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.inkMuted,
    textDecorationLine: 'line-through',
  },
});
