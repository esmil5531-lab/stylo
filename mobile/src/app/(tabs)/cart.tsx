import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/client';
import { useCart, useCheckout, useSetCartQuantity, useShareCart } from '@/api/hooks';
import type { Cart, CheckoutResult, DeliveryMode } from '@/api/types';
import { Button } from '@/components/Button';
import { CartGroupCard } from '@/components/cart/CartGroupCard';
import { DeliveryOptionCard } from '@/components/DeliveryOptionCard';
import { EmptyState, QueryState } from '@/components/QueryState';
import { ar } from '@/i18n/ar';
import { arrivalLabel, formatPrice } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

export default function CartScreen() {
  const cart = useCart();
  const share = useShareCart();
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [placed, setPlaced] = useState<CheckoutResult | null>(null);

  const onShare = () =>
    share.mutate(undefined, {
      onSuccess: async ({ token }) => {
        // Works in Expo Go (exp://…), dev/prod builds (stylo://…) and on the web (https://…).
        const link = Linking.createURL(`/shared-cart/${token}`);
        setShareLink(link);
        if (Platform.OS !== 'web') {
          await Share.share({ message: ar.cart.shareMessage(link) }).catch(() => undefined);
        }
      },
    });

  const hasItems = (cart.data?.itemsCount ?? 0) > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{ar.cart.title}</Text>
        {hasItems && (
          <Pressable onPress={onShare} style={styles.shareBtn} disabled={share.isPending} hitSlop={6}>
            <Ionicons name="share-social-outline" size={18} color={colors.primary} />
            <Text style={styles.shareText}>{ar.cart.share}</Text>
          </Pressable>
        )}
      </View>

      {placed ? (
        <OrderPlaced result={placed} onDone={() => setPlaced(null)} />
      ) : (
        <QueryState query={cart} minHeight={300}>
          {(data) =>
            data.itemsCount === 0 ? (
              <EmptyState
                icon="bag-handle-outline"
                title={ar.cart.empty}
                hint={ar.cart.emptyHint}
                action={
                  <Button title={ar.cart.startShopping} onPress={() => router.navigate('/')} style={styles.cta} />
                }
              />
            ) : (
              <CartContent
                cart={data}
                shareLink={shareLink}
                shareError={share.isError ? errorMessage(share.error) : null}
                onPlaced={setPlaced}
              />
            )
          }
        </QueryState>
      )}
    </SafeAreaView>
  );
}

function CartContent({
  cart,
  shareLink,
  shareError,
  onPlaced,
}: {
  cart: Cart;
  shareLink: string | null;
  shareError: string | null;
  onPlaced: (r: CheckoutResult) => void;
}) {
  const [mode, setMode] = useState<DeliveryMode>('fastest');
  const setQty = useSetCartQuantity();
  const checkout = useCheckout();

  // Unified needs 2+ stores; fall back if the cart shrank to one store.
  const effectiveMode: DeliveryMode = mode === 'unified' && !cart.delivery.unified.available ? 'fastest' : mode;
  const option = cart.delivery[effectiveMode];
  const total = cart.totals[effectiveMode];

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        {shareLink && (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>{ar.cart.shareReady}</Text>
            <Text selectable style={styles.link}>
              {shareLink}
            </Text>
          </View>
        )}
        {shareError && <Text style={styles.error}>{shareError}</Text>}

        <Text style={styles.meta}>
          {ar.common.pieces(cart.itemsCount)} · {ar.common.fromStores(cart.storeCount)}
        </Text>

        {cart.groups.map((g) => (
          <CartGroupCard
            key={g.store.id}
            group={g}
            currency={cart.currency}
            showShipment={effectiveMode === 'fastest'}
            onQuantity={(variantId, quantity) => setQty.mutate({ variantId, quantity })}
            busy={setQty.isPending}
          />
        ))}
        {setQty.isError && <Text style={styles.error}>{errorMessage(setQty.error)}</Text>}

        <Text style={styles.section}>{ar.delivery.chooseTitle}</Text>
        <View style={{ gap: spacing.sm }}>
          <DeliveryOptionCard
            option={cart.delivery.fastest}
            selected={effectiveMode === 'fastest'}
            onSelect={() => setMode('fastest')}
            currency={cart.currency}
          />
          <DeliveryOptionCard
            option={cart.delivery.unified}
            selected={effectiveMode === 'unified'}
            onSelect={() => setMode('unified')}
            currency={cart.currency}
            savings={cart.delivery.unified.savings}
          />
        </View>

        <View style={styles.summary}>
          <Row label={ar.cart.subtotal} value={formatPrice(cart.subtotal, cart.currency)} />
          <Row
            label={`${ar.delivery.fee} · ${arrivalLabel(option.dayOffset)}`}
            value={option.fee === 0 ? ar.delivery.free : formatPrice(option.fee, cart.currency)}
          />
          <View style={styles.divider} />
          <Row label={ar.cart.total} value={formatPrice(total, cart.currency)} strong />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {cart.hasIssues && <Text style={styles.error}>{ar.cart.fixIssues}</Text>}
        {checkout.isError && <Text style={styles.error}>{errorMessage(checkout.error)}</Text>}
        <Button
          title={`${ar.cart.checkout} · ${formatPrice(total, cart.currency)}`}
          loading={checkout.isPending}
          disabled={cart.hasIssues}
          onPress={() => checkout.mutate({ deliveryMode: effectiveMode }, { onSuccess: onPlaced })}
        />
      </View>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

function OrderPlaced({ result, onDone }: { result: CheckoutResult; onDone: () => void }) {
  return (
    <ScrollView contentContainerStyle={[styles.content, styles.placed]}>
      <View style={styles.placedIcon}>
        <Ionicons name="checkmark" size={40} color={colors.white} />
      </View>
      <Text style={styles.placedTitle}>{ar.cart.orderPlaced}</Text>
      <Text style={styles.meta}>{ar.cart.orderPlacedHint(result.orders.length)}</Text>
      {result.orders.map((o) => (
        <View key={o.id} style={styles.placedRow}>
          <Text style={styles.rowLabel}>
            {ar.orders.number(o.orderNumber)} · {o.store.name}
          </Text>
          <Text style={styles.rowValue}>{formatPrice(o.total, result.currency)}</Text>
        </View>
      ))}
      <Button
        title={ar.orders.title}
        onPress={() => {
          onDone();
          router.push('/orders');
        }}
        style={styles.cta}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: { fontFamily: fonts.extraBold, fontSize: 22, color: colors.ink },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  shareText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.primary },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted },
  section: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink, marginTop: spacing.xs },
  notice: { backgroundColor: colors.successSoft, borderRadius: radius.md, padding: 12, gap: 4 },
  noticeTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.success },
  link: { fontFamily: fonts.regular, fontSize: 12, color: colors.ink, writingDirection: 'ltr' },
  error: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.danger, textAlign: 'center' },
  summary: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkMuted, flexShrink: 1 },
  rowValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  strong: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink },
  divider: { height: 1, backgroundColor: colors.border },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  cta: { alignSelf: 'stretch', marginTop: spacing.md },
  placed: { alignItems: 'center', paddingTop: spacing.xl },
  placedIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placedTitle: { fontFamily: fonts.extraBold, fontSize: 20, color: colors.ink },
  placedRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 12,
  },
});
