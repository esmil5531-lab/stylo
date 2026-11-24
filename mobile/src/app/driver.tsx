import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import {
  useDriverDeliver,
  useDriverHome,
  useDriverOrders,
  useDriverPickUp,
  useDriverStatus,
} from '@/api/hooks';
import type { DriverHome, DriverOrder } from '@/api/types';
import { Button } from '@/components/Button';
import { QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SignInPrompt } from '@/components/SignInPrompt';
import { StatusBadge } from '@/components/StatusBadge';
import { ar } from '@/i18n/ar';
import { deliveryModeLabel, formatDate, formatPrice } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

const t = ar.driver;

/**
 * «لوحة المندوب» — driver mode inside the Stylo app (role `driver`).
 * Shows the cash in custody, the orders to pick up and deliver, and today's deliveries.
 * Drivers never see commission or what a store is owed: only the amount to collect.
 */
export default function DriverScreen() {
  const { signedIn } = useSession();
  const home = useDriverHome();
  const orders = useDriverOrders();
  const notDriver = home.error instanceof ApiError && home.error.status === 403;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t.title} />
      {!signedIn ? (
        <SignInPrompt />
      ) : notDriver ? (
        <Text style={styles.notice}>{t.notDriver}</Text>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={home.isRefetching || orders.isRefetching}
              onRefresh={() => {
                void home.refetch();
                void orders.refetch();
              }}
              tintColor={colors.primary}
            />
          }
        >
          <QueryState query={home}>{(h) => <Summary home={h} />}</QueryState>

          <QueryState query={orders}>
            {(o) => (
              <>
                <Text style={styles.section}>{t.active}</Text>
                {o.active.length === 0 ? (
                  <Text style={styles.empty}>{t.noActive}</Text>
                ) : (
                  o.active.map((order) => <OrderCard key={order.id} order={order} />)
                )}
                {o.deliveredToday.length > 0 && (
                  <>
                    <Text style={styles.section}>{t.doneToday}</Text>
                    {o.deliveredToday.map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                  </>
                )}
              </>
            )}
          </QueryState>
        </ScrollView>
      )}
    </View>
  );
}

function Summary({ home }: { home: DriverHome }) {
  const setStatus = useDriverStatus();
  const { driver, custody } = home;
  const online = driver.status !== 'offline';
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.hello}>{t.hello(driver.name.split(' ')[0] ?? driver.name)}</Text>
          <Text style={styles.muted}>
            {driver.city} · {t.deliveredToday(home.today.delivered)}
          </Text>
        </View>
        <View style={[styles.pill, online ? styles.pillOn : styles.pillOff]}>
          <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.inkMuted }]} />
          <Text style={[styles.pillText, { color: online ? colors.success : colors.inkMuted }]}>
            {t.status[driver.status]}
          </Text>
        </View>
      </View>

      <View style={styles.custody}>
        <Text style={styles.custodyLabel}>{t.custodyTitle}</Text>
        <Text style={styles.custodyAmount}>{formatPrice(custody.amount)}</Text>
        <Text style={styles.custodyHint}>
          {custody.ordersCount > 0 ? `${t.custodyOrders(custody.ordersCount)} · ${t.custodyHint}` : t.custodyEmpty}
        </Text>
        {home.lastSettlement && (
          <Text style={styles.custodyHint}>
            {t.lastSettlement(
              formatPrice(home.lastSettlement.amountReceived),
              home.lastSettlement.receivedBy,
              formatDate(home.lastSettlement.at),
            )}
          </Text>
        )}
      </View>

      {driver.status !== 'busy' && (
        <Button
          title={online ? t.goOffline : t.goOnline}
          variant={online ? 'outline' : 'primary'}
          loading={setStatus.isPending}
          onPress={() => setStatus.mutate(online ? 'offline' : 'available')}
        />
      )}
      {setStatus.error && <Text style={styles.error}>{errorMessage(setStatus.error)}</Text>}
    </View>
  );
}

function call(phone: string | null) {
  if (phone) void Linking.openURL(`tel:${phone}`);
}

function OrderCard({ order }: { order: DriverOrder }) {
  const pickUp = useDriverPickUp();
  const deliver = useDriverDeliver();
  const [confirming, setConfirming] = useState(false);
  const cash = formatPrice(order.amountToCollect);
  const pieces = order.items.reduce((s, i) => s + i.quantity, 0);
  const error = pickUp.error ?? deliver.error;
  const done = order.status === 'delivered';

  return (
    <View style={[styles.card, done && styles.cardDone]}>
      <View style={styles.rowBetween}>
        <Text style={styles.orderNo}>{t.order(order.orderNumber)}</Text>
        <StatusBadge status={order.status} />
      </View>
      <Text style={styles.muted}>
        {deliveryModeLabel(order.deliveryMode)} · {t.items(pieces)}
      </Text>

      <Stop
        icon="storefront-outline"
        title={t.pickup}
        name={order.pickup.storeName}
        address={[order.pickup.district, order.pickup.address, order.pickup.city].filter(Boolean).join('، ')}
        phone={order.pickup.phone}
      />
      <Stop
        icon="location-outline"
        title={t.dropoff}
        name={order.dropoff.name}
        address={[order.dropoff.district, order.dropoff.street, order.dropoff.city].filter(Boolean).join('، ')}
        phone={order.dropoff.phone}
      />

      <Text style={styles.items} numberOfLines={2}>
        {order.items.map((i) => `${i.name}${i.size ? ` (${i.size})` : ''} × ${i.quantity}`).join(' · ')}
      </Text>

      <View style={[styles.cash, order.paymentMethod === 'online' && styles.cashPaid]}>
        <Ionicons name="cash-outline" size={18} color={colors.success} />
        <Text style={styles.cashText}>
          {done
            ? t.collected(cash)
            : order.paymentMethod === 'cod'
              ? t.collect(cash)
              : t.paidOnline}
        </Text>
      </View>

      {order.canPickUp && (
        <Button title={t.pickedUp} loading={pickUp.isPending} onPress={() => pickUp.mutate(order.id)} />
      )}
      {order.status === 'confirmed' && <Text style={styles.muted}>{t.waitingStore}</Text>}
      {order.canDeliver &&
        (confirming ? (
          <View style={styles.confirm}>
            <Text style={styles.confirmTitle}>
              {order.paymentMethod === 'cod' ? t.confirmDeliver(cash) : t.confirmDeliverTitle}
            </Text>
            <View style={styles.row}>
              <Button
                title={t.yes}
                loading={deliver.isPending}
                onPress={() => deliver.mutate(order.id, { onSettled: () => setConfirming(false) })}
                style={{ flex: 1 }}
              />
              <Button title={t.cancel} variant="outline" onPress={() => setConfirming(false)} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Button
            title={order.paymentMethod === 'cod' ? t.delivered(cash) : t.deliveredNoCash}
            onPress={() => setConfirming(true)}
          />
        ))}
      {error && <Text style={styles.error}>{errorMessage(error)}</Text>}
    </View>
  );
}

function Stop({
  icon,
  title,
  name,
  address,
  phone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  name: string;
  address: string;
  phone: string | null;
}) {
  return (
    <View style={styles.stop}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.stopTitle}>{title}</Text>
        <Text style={styles.stopName}>{name}</Text>
        {!!address && <Text style={styles.muted}>{address}</Text>}
      </View>
      {phone && (
        <Pressable
          onPress={() => call(phone)}
          style={styles.callBtn}
          accessibilityRole="button"
          accessibilityLabel={`${t.call} ${name}`}
        >
          <Ionicons name="call" size={16} color={colors.white} />
          <Text style={styles.callText}>{t.call}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  notice: { padding: spacing.lg, fontFamily: fonts.semiBold, fontSize: 15, color: colors.inkSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  hello: { fontFamily: fonts.extraBold, fontSize: 22, lineHeight: 34, color: colors.ink },
  muted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pillOn: { backgroundColor: colors.successSoft },
  pillOff: { backgroundColor: colors.surface },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 20 },
  custody: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 2,
  },
  custodyLabel: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 22, color: colors.primarySoft },
  custodyAmount: { fontFamily: fonts.extraBold, fontSize: 34, lineHeight: 50, color: colors.white },
  custodyHint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.primarySoft },
  section: { fontFamily: fonts.extraBold, fontSize: 17, lineHeight: 28, color: colors.ink, marginTop: spacing.sm },
  empty: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.inkMuted,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  cardDone: { opacity: 0.85 },
  orderNo: { fontFamily: fonts.extraBold, fontSize: 16, lineHeight: 26, color: colors.ink },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stopTitle: { fontFamily: fonts.semiBold, fontSize: 12, lineHeight: 18, color: colors.inkMuted },
  stopName: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 24, color: colors.ink },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  callText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 20, color: colors.white },
  items: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.inkSecondary, writingDirection: 'rtl' },
  cash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  cashPaid: { backgroundColor: colors.surfaceMuted },
  cashText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 24, color: colors.success },
  confirm: { gap: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: spacing.sm },
  confirmTitle: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 24, color: colors.primaryDark },
  error: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 20, color: colors.danger },
});
