import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/client';
import { useAddToCart, useCart, useCompleteTheLook, useProduct } from '@/api/hooks';
import type { ProductDetail } from '@/api/types';
import { Button } from '@/components/Button';
import { storeConflictOf, useStoreConflictGuard } from '@/components/cart/StoreConflictDialog';
import { DeliveryBadge } from '@/components/DeliveryBadge';
import { ProductCard } from '@/components/ProductCard';
import { ProductImage } from '@/components/ProductImage';
import { QueryState } from '@/components/QueryState';
import { Rating } from '@/components/Rating';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { ReviewsSection } from '@/components/product/ReviewsSection';
import { VariantPicker } from '@/components/product/VariantPicker';
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
  const [variantId, setVariantId] = useState<string | undefined>(firstInStock?.id);
  const variant = product.variants.find((v) => v.id === variantId);
  const add = useAddToCart();
  const guard = useStoreConflictGuard();
  // Heads-up before the dialog: the cart is bound to another store.
  const cart = useCart();
  const otherStore = cart.data?.store && cart.data.store.id !== product.store.id ? cart.data.store : null;

  const addToCart = (variantId: string) =>
    add.mutate(
      { variantId, quantity: 1 },
      {
        onError: (e) =>
          guard.handle(e, {
            onReplace: () => add.mutate({ variantId, quantity: 1, replaceCart: true }),
            onKeep: add.reset,
          }),
      },
    );
  const look = useCompleteTheLook(product.id);

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.hero}>
          <ProductImage
            uri={product.images[0]?.url ?? product.imageUrl}
            colorHex={variant?.colorHex ?? product.colorHex}
            category={product.category}
            icon={product.categoryIcon}
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
            {product.discountPercent ? (
              <View style={styles.sale}>
                <Text style={styles.saleText}>{ar.product.discount(product.discountPercent)}</Text>
              </View>
            ) : null}
          </View>
          {product.delivery ? (
            <DeliveryBadge dayOffset={product.delivery.dayOffset} />
          ) : product.coverageNote ? (
            <View style={styles.coverage}>
              <Ionicons name="location-outline" size={18} color={colors.warning} />
              <Text style={styles.coverageText}>{product.coverageNote}</Text>
            </View>
          ) : null}
          {product.description && <Text style={styles.description}>{product.description}</Text>}

          <VariantPicker variants={product.variants} selected={variant} onSelect={(v) => setVariantId(v?.id)} />
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

        <ReviewsSection productId={product.id} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        {otherStore && !add.isSuccess && (
          <Text style={styles.note}>{ar.product.cartFromOtherStore(otherStore.name)}</Text>
        )}
        {add.isError && !storeConflictOf(add.error) && <Text style={styles.error}>{errorMessage(add.error)}</Text>}
        {add.isSuccess ? (
          <View style={styles.footerRow}>
            <Text style={styles.added}>✓ {ar.product.added}</Text>
            <Button title={ar.product.viewCart} variant="outline" onPress={() => router.navigate('/cart')} />
          </View>
        ) : (
          <Button
            title={
              !variant
                ? product.inStock
                  ? ar.product.chooseSize
                  : ar.product.outOfStock
                : variant.stock > 0
                  ? ar.product.addToCart
                  : ar.product.outOfStock
            }
            disabled={!variant || variant.stock === 0}
            loading={add.isPending}
            onPress={() => variant && addToCart(variant.id)}
          />
        )}
      </View>
      {guard.dialog}
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
  compare: { fontFamily: fonts.regular, fontSize: 15, color: colors.inkMuted, textDecorationLine: 'line-through' },
  description: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, color: colors.inkMuted },
  coverage: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  coverageText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 21, color: colors.warning },
  label: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, marginTop: spacing.sm },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  sale: { backgroundColor: colors.saleSoft, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  saleText: { fontFamily: fonts.bold, fontSize: 13, color: colors.sale, writingDirection: 'ltr' },
  note: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.inkMuted, textAlign: 'center' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  added: { fontFamily: fonts.bold, fontSize: 14, color: colors.success },
  error: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.danger, textAlign: 'center' },
});
