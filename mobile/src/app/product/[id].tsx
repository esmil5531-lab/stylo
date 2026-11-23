import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/client';
import { useAddToCart, useCompleteTheLook, useProduct } from '@/api/hooks';
import type { ProductDetail } from '@/api/types';
import { Button } from '@/components/Button';
import { DeliveryBadge } from '@/components/DeliveryBadge';
import { ProductCard } from '@/components/ProductCard';
import { ProductImage } from '@/components/ProductImage';
import { QueryState } from '@/components/QueryState';
import { Rating } from '@/components/Rating';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { WishlistButton } from '@/components/WishlistButton';
import { ar } from '@/i18n/ar';
import { formatPrice } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const product = useProduct(id);
  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={product.data?.store.name ?? ''}
        end={product.data && <WishlistButton productId={product.data.id} initial={product.data.isWishlisted} size={20} />}
      />
      <QueryState query={product} minHeight={400}>
        {(p) => <ProductBody product={p} />}
      </QueryState>
    </View>
  );
}

function ProductBody({ product }: { product: ProductDetail }) {
  const insets = useSafeAreaInsets();
  const firstInStock = product.variants.find((v) => v.stock > 0) ?? product.variants[0];
  const [variantId, setVariantId] = useState(firstInStock?.id);
  const variant = product.variants.find((v) => v.id === variantId);
  const add = useAddToCart();
  const look = useCompleteTheLook(product.id);

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.hero}>
          <ProductImage
            uri={product.images[0]?.url ?? product.imageUrl}
            colorHex={variant?.colorHex ?? product.colorHex}
            category={product.category}
            name={product.name}
            iconSize={110}
          />
        </View>

        <View style={styles.info}>
          <Pressable onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: product.store.slug } })}>
            <Text style={styles.store}>
              {ar.product.soldBy} {product.store.name} · {product.store.city}
            </Text>
          </Pressable>
          <Text style={styles.name}>{product.name}</Text>
          <Rating value={product.rating} count={product.ratingCount} size={14} />
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(variant?.price ?? product.price, product.currency)}</Text>
            {product.compareAtPrice ? (
              <Text style={styles.compare}>{formatPrice(product.compareAtPrice, product.currency)}</Text>
            ) : null}
          </View>
          <DeliveryBadge dayOffset={product.delivery.dayOffset} />
          {product.description && <Text style={styles.description}>{product.description}</Text>}

          {product.variants.length > 1 && (
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.label}>{product.variants.some((v) => v.size) ? ar.product.size : ar.product.color}</Text>
              <View style={styles.chips}>
                {product.variants.map((v) => {
                  const active = v.id === variantId;
                  const out = v.stock === 0;
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => setVariantId(v.id)}
                      disabled={out}
                      style={[styles.chip, active && styles.chipActive, out && styles.chipOut]}
                    >
                      {v.colorHex && <View style={[styles.swatch, { backgroundColor: v.colorHex }]} />}
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {v.size ?? v.colorName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {look.data && look.data.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <SectionHeader title={ar.product.completeTheLook} />
            <FlatList
              horizontal
              data={look.data}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => <ProductCard product={item} width={150} />}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 10, paddingBottom: 6 }}
            />
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        {add.isError && <Text style={styles.error}>{errorMessage(add.error)}</Text>}
        {add.isSuccess ? (
          <View style={styles.footerRow}>
            <Text style={styles.added}>✓ {ar.product.added}</Text>
            <Button title={ar.product.viewCart} variant="outline" onPress={() => router.navigate('/cart')} />
          </View>
        ) : (
          <Button
            title={variant && variant.stock > 0 ? ar.product.addToCart : ar.product.outOfStock}
            disabled={!variant || variant.stock === 0}
            loading={add.isPending}
            onPress={() => variant && add.mutate({ variantId: variant.id, quantity: 1 })}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { height: 360, marginHorizontal: spacing.md, borderRadius: radius.lg, overflow: 'hidden' },
  info: { padding: spacing.md, gap: spacing.sm },
  store: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.primary },
  name: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.ink },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  price: { fontFamily: fonts.extraBold, fontSize: 24, color: colors.ink },
  compare: { fontFamily: fonts.regular, fontSize: 15, color: colors.inkFaint, textDecorationLine: 'line-through' },
  description: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, color: colors.inkMuted },
  label: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 52,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipOut: { opacity: 0.4 },
  chipText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.ink },
  chipTextActive: { color: colors.primary },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.border },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  added: { fontFamily: fonts.bold, fontSize: 14, color: colors.success },
  error: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.danger, textAlign: 'center' },
});
