import { router, useLocalSearchParams } from 'expo-router';
import { Fragment } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/client';
import { useAddLookToCart, useLook } from '@/api/hooks';
import { Button } from '@/components/Button';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductImage } from '@/components/ProductImage';
import { QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ar } from '@/i18n/ar';
import { formatPrice } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

/** "كمّل اللوك": the whole outfit, its total, and one tap to add every piece to the cart. */
export default function LookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const look = useLook(id);
  const add = useAddLookToCart();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScreenHeader title={ar.look.title} />
      <QueryState query={look} minHeight={400}>
        {(l) => {
          const currency = l.items[0]?.currency ?? 'LYD';
          return (
            <>
              <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
                <View style={styles.hero}>
                  <Text style={styles.title}>{l.title}</Text>
                  {l.subtitle && <Text style={styles.subtitle}>{l.subtitle}</Text>}
                  <View style={styles.strip}>
                    {l.items.map((p, i) => (
                      <Fragment key={p.id}>
                        {i > 0 && <Text style={styles.plus}>+</Text>}
                        <View style={styles.tile}>
                          <ProductImage uri={p.imageUrl} colorHex={p.colorHex} category={p.category} name={p.name} iconSize={30} />
                        </View>
                      </Fragment>
                    ))}
                  </View>
                </View>
                <ProductGrid products={l.items} />
              </ScrollView>

              <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    {ar.look.total} · {ar.common.fromStores(l.storeCount)}
                  </Text>
                  <Text style={styles.total}>{formatPrice(l.totalPrice, currency)}</Text>
                </View>
                {add.isError && <Text style={styles.error}>{errorMessage(add.error)}</Text>}
                {add.isSuccess ? (
                  <Button title={ar.product.viewCart} variant="outline" onPress={() => router.navigate('/cart')} />
                ) : (
                  <Button title={ar.look.addAll} loading={add.isPending} onPress={() => add.mutate(l.slug)} />
                )}
              </View>
            </>
          );
        }}
      </QueryState>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.heroBackground,
    gap: spacing.sm,
  },
  title: { fontFamily: fonts.extraBold, fontSize: 20, color: colors.primary },
  subtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.primaryDark },
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  tile: { flex: 1, aspectRatio: 1, maxWidth: 80, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.white },
  plus: { fontFamily: fonts.bold, fontSize: 18, color: colors.primary, marginHorizontal: 4 },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted },
  total: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
  error: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.danger, textAlign: 'center' },
});
