import { useSession } from '@/lib/session';
import { SignInPrompt } from '@/components/SignInPrompt';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useCancelOrder, useOrder } from '@/api/hooks';
import { Button } from '@/components/Button';
import type { OrderDetail } from '@/api/types';
import { QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { ORDER_STATUS_META, type OrderStatus } from '@/constants/orderStatus';
import { ar } from '@/i18n/ar';
import { deliveryModeLabel, formatDate, formatPrice } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

/** The normal path through the six statuses; "ملغي" replaces the remaining steps. */
const HAPPY_PATH: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

export default function OrderScreen() {
  const { signedIn } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useOrder(id);
  return (
    <View style={styles.screen}>
      <ScreenHeader title={order.data ? ar.orders.number(order.data.orderNumber) : ''} />
      {!signedIn ? (
        <SignInPrompt />
      ) : (
      <QueryState query={order} minHeight={400}>
        {(o) => <OrderBody order={o} />}
      </QueryState>
      )}
    </View>
  );
}

function OrderBody({ order }: { order: OrderDetail }) {
  const reached = new Map(order.history.map((h) => [h.to, h.at]));
  const cancelled = order.status === 'cancelled';
  const steps: OrderStatus[] = cancelled
    ? [...HAPPY_PATH.filter((s) => reached.has(s)), 'cancelled']
    : HAPPY_PATH;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.store}>{order.store.name}</Text>
          <StatusBadge status={order.status} />
        </View>
        <Text style={styles.meta}>
          {ar.orders.deliveryMode}: {deliveryModeLabel(order.deliveryMode)}
        </Text>
        {order.estimatedDeliveryAt && !cancelled && (
          <Text style={styles.meta}>
            {ar.orders.expected}: {formatDate(order.estimatedDeliveryAt)}
          </Text>
        )}
      </View>

      {cancelled && order.cancelReason && (
        <View style={[styles.card, styles.reasonCard]}>
          <Text style={styles.reasonText}>{ar.orders.cancelReason(order.cancelReason)}</Text>
        </View>
      )}

      <Text style={styles.section}>{ar.orders.statusesTitle}</Text>
      <View style={styles.card}>
        {steps.map((s, i) => {
          const done = reached.has(s);
          const color = done ? ORDER_STATUS_META[s].color : colors.inkMuted;
          return (
            <View key={s} style={styles.step}>
              <View style={styles.rail}>
                <View style={[styles.dot, { backgroundColor: done ? color : colors.surface, borderColor: color }]} />
                {i < steps.length - 1 && <View style={[styles.line, done && { backgroundColor: color }]} />}
              </View>
              <View style={{ flex: 1, paddingBottom: spacing.md }}>
                <Text style={[styles.stepLabel, { color: done ? colors.ink : colors.inkMuted }]}>
                  {ORDER_STATUS_META[s].labelAr}
                </Text>
                {done && <Text style={[styles.meta, styles.rtl]}>{formatDate(reached.get(s)!)}</Text>}
              </View>
            </View>
          );
        })}
      </View>

      <Text style={styles.section}>{ar.orders.summary}</Text>
      <View style={styles.card}>
        {order.items.map((it) => (
          <View key={it.id} style={styles.row}>
            <Text style={styles.itemName} numberOfLines={1}>
              {it.name} {[it.colorName, it.size].filter(Boolean).length ? `(${[it.colorName, it.size].filter(Boolean).join(' · ')})` : ''} × {it.quantity}
            </Text>
            <Text style={styles.value}>{formatPrice(it.lineTotal, order.currency)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <Line label={ar.cart.subtotal} value={formatPrice(order.subtotal, order.currency)} />
        <Line label={ar.delivery.fee} value={formatPrice(order.shippingFee, order.currency)} />
        <Line label={ar.cart.total} value={formatPrice(order.total, order.currency)} strong />
      </View>

      <Text style={styles.section}>{ar.orders.shipTo}</Text>
      <View style={styles.card}>
        <Text style={styles.value}>{order.shippingAddress.recipient_name}</Text>
        <Text style={styles.meta}>
          {[order.shippingAddress.city, order.shippingAddress.district, order.shippingAddress.street]
            .filter(Boolean)
            .join('، ')}
        </Text>
        {(order.shippingAddress.building || order.shippingAddress.landmark) && (
          <Text style={styles.meta}>
            {[order.shippingAddress.building, order.shippingAddress.landmark].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>

      {order.status === 'pending' && <CancelOrder id={order.id} />}
    </ScrollView>
  );
}

/** «قيد الانتظار» only: the store has not confirmed yet, the customer may still cancel. */
function CancelOrder({ id }: { id: string }) {
  const cancel = useCancelOrder();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <Button title={ar.orders.cancel} variant="outline" onPress={() => setConfirming(true)} />;
  }
  return (
    <View style={[styles.card, styles.confirm]}>
      <Text style={styles.value}>{ar.orders.cancelConfirm}</Text>
      <Text style={styles.meta}>{ar.orders.cancelHint}</Text>
      <View style={styles.actions}>
        <Button
          title={ar.orders.cancelYes}
          loading={cancel.isPending}
          onPress={() => cancel.mutate({ id }, { onSettled: () => setConfirming(false) })}
          style={{ flex: 1 }}
        />
        <Button title={ar.common.back} variant="outline" onPress={() => setConfirming(false)} style={{ flex: 1 }} />
      </View>
      {cancel.isError && <Text style={styles.error}>{errorMessage(cancel.error)}</Text>}
    </View>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.meta, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.value, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  store: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  section: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink, marginTop: spacing.sm },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted },
  reasonCard: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  reasonText: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 22, color: colors.danger },
  confirm: { borderColor: colors.primary },
  actions: { flexDirection: 'row', gap: spacing.sm },
  error: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 20, color: colors.danger },
  value: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  strong: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.ink },
  itemName: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.ink },
  rtl: { writingDirection: 'rtl' },
  divider: { height: 1, backgroundColor: colors.border },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 16 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  stepLabel: { fontFamily: fonts.bold, fontSize: 14 },
});
