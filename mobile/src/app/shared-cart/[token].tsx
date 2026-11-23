import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/client';
import { useImportSharedCart, useSharedCart } from '@/api/hooks';
import { Button } from '@/components/Button';
import { CartGroupCard } from '@/components/cart/CartGroupCard';
import { storeConflictOf, useStoreConflictGuard } from '@/components/cart/StoreConflictDialog';
import { EmptyState, QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ar } from '@/i18n/ar';
import { formatPrice } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

/** Opened from a shared link (…/shared-cart/<token>). Read-only view + "add all to my cart". */
export default function SharedCartScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const shared = useSharedCart(token);
  const importCart = useImportSharedCart();
  const guard = useStoreConflictGuard();
  const insets = useSafeAreaInsets();

  const goToCart = () => router.navigate('/cart');
  const addAll = () =>
    importCart.mutate(
      { token },
      {
        onSuccess: goToCart,
        onError: (e) =>
          guard.handle(e, {
            onReplace: () => importCart.mutate({ token, replaceCart: true }, { onSuccess: goToCart }),
            onKeep: importCart.reset,
          }),
      },
    );

  return (
    <View style={styles.screen}>
      <ScreenHeader title={ar.sharedCart.title} />
      <QueryState query={shared} minHeight={400}>
        {(s) =>
          !s.cart.store ? (
            <EmptyState icon="bag-handle-outline" title={ar.cart.empty} />
          ) : (
            <>
              <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.banner}>
                  <Text style={styles.bannerTitle}>{ar.sharedCart.sharedBy(s.sharedBy)}</Text>
                  <Text style={styles.bannerMeta}>
                    {ar.common.pieces(s.cart.itemsCount)} · {s.cart.store.name}
                  </Text>
                </View>
                <CartGroupCard
                  store={s.cart.store}
                  items={s.cart.items}
                  subtotal={s.cart.subtotal}
                  currency={s.cart.currency}
                />
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{ar.cart.subtotal}</Text>
                  <Text style={styles.total}>{formatPrice(s.cart.subtotal, s.cart.currency)}</Text>
                </View>
                {importCart.isError && !storeConflictOf(importCart.error) && (
                  <Text style={styles.error}>{errorMessage(importCart.error)}</Text>
                )}
                <Button title={ar.sharedCart.addAll} loading={importCart.isPending} onPress={addAll} />
              </View>
            </>
          )
        }
      </QueryState>
      {guard.dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  banner: { backgroundColor: colors.heroBackground, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  bannerTitle: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.primary },
  bannerMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.primaryDark },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkMuted },
  total: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink },
  error: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.danger, textAlign: 'center' },
});
