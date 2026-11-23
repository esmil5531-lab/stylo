import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CartItem, CartStore } from '@/api/types';
import { ar } from '@/i18n/ar';
import { formatPrice } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

import { ProductImage } from '../ProductImage';
import { QuantityStepper } from '../QuantityStepper';
import { StoreAvatar } from '../StoreAvatar';

/**
 * The cart's one store with its items. `onQuantity` is omitted for read-only (shared) carts.
 */
export function CartGroupCard({
  store,
  items,
  subtotal,
  currency,
  onQuantity,
  busy,
}: {
  store: CartStore;
  items: CartItem[];
  subtotal: number;
  currency: string;
  onQuantity?: (variantId: string, quantity: number) => void;
  busy?: boolean;
}) {
  return (
    <View style={styles.card}>
      <Pressable
        style={styles.head}
        onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: store.slug } })}
      >
        <StoreAvatar logoText={store.logoText} brandColor={store.brandColor} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.storeName}>{ar.cart.orderFrom(store.name)}</Text>
          <Text style={styles.storeMeta}>
            {store.city} · {ar.cart.singleStoreNote}
          </Text>
        </View>
      </Pressable>

      {items.map((item) => (
        <View key={item.variantId} style={styles.item}>
          <Pressable
            style={styles.thumb}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.productId } })}
          >
            <ProductImage
              uri={item.imageUrl}
              colorHex={item.colorHex}
              category={item.category}
              name={item.name}
              iconSize={28}
            />
          </Pressable>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.variant, styles.rtl]}>
              {[item.colorName, item.size].filter(Boolean).join(' · ')}
            </Text>
            {item.issue && (
              <Text style={styles.issue}>
                {item.issue === 'unavailable' ? ar.cart.issueUnavailable : ar.cart.issueStock(item.stock)}
              </Text>
            )}
            <View style={styles.itemFoot}>
              <Text style={styles.price}>{formatPrice(item.lineTotal, currency)}</Text>
              {onQuantity ? (
                <QuantityStepper
                  value={item.quantity}
                  max={Math.max(item.stock, item.quantity)}
                  onChange={(q) => onQuantity(item.variantId, q)}
                  disabled={busy}
                />
              ) : (
                <Text style={[styles.variant, styles.rtl]}>× {item.quantity}</Text>
              )}
            </View>
          </View>
        </View>
      ))}

      <View style={styles.subtotal}>
        <Text style={styles.subLabel}>{ar.cart.subtotal}</Text>
        <Text style={styles.subValue}>{formatPrice(subtotal, currency)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: 12,
    backgroundColor: colors.primarySoft,
  },
  storeName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  storeMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted },
  item: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thumb: { width: 72, height: 84, borderRadius: radius.sm, overflow: 'hidden' },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  variant: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted },
  rtl: { writingDirection: 'rtl' },
  issue: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.danger },
  itemFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
  price: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.ink },
  subtotal: { flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  subLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted },
  subValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
});
