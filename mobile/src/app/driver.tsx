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
import { deliveryModeLabel, formatDate, formatLibyaTime, formatPrice, whatsappNumber } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

const t = ar.driver;

/** Stages in the order the driver works them: on the road first, then pick-ups, then waiting. */
const GROUPS = ['shipped', 'processing', 'confirmed'] as const;

/**
 * «لوحة المندوب» — driver mode inside the Stylo app (role `driver`).
 * Top: cash in custody and cash still to collect. Then the orders grouped by what to do next,
 * each with the stop that matters now, call / WhatsApp / map buttons, the full item list and the
 * amount to collect. Drivers never see commission or what a store is owed.
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
                {o.active.length === 0 && (
                  <View style={styles.emptyBox}>
                    <Ionicons name="bicycle-outline" size={28} color={colors.inkMuted} />
                    <Text style={styles.emptyTitle}>{t.noActive}</Text>
                    <Text style={styles.muted}>{t.noActiveHint}</Text>
                  </View>
                )}
                {GROUPS.map((status) => {
                  const list = o.active.filter((x) => x.status === status);
                  if (list.length === 0) return null;
                  return (
                    <View key={status} style={styles.group}>
                      <View style={styles.groupHead}>
                        <Text style={styles.section}>{t.groups[status].title}</Text>
                        <View style={styles.count}>
                          <Text style={styles.countText}>{list.length}</Text>
                        </View>
                      </View>
                      <Text style={styles.muted}>{t.groups[status].hint}</Text>
                      {list.map((order) => (
                        <OrderCard key={order.id} order={order} />
                      ))}
                    </View>
                  );
                })}
                {o.deliveredToday.length > 0 && (
                  <View style={styles.group}>
                    <Text style={styles.section}>{t.doneToday}</Text>
                    <View style={styles.doneList}>
                      {o.deliveredToday.map((order) => (
                        <DoneRow key={order.id} order={order} />
                      ))}
                    </View>
                  </View>
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
  const { driver, custody, toCollect } = home;
  const online = driver.status !== 'offline';
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
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
        <View style={styles.custodyRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.custodyLabel}>{t.custodyTitle}</Text>
            <Text style={styles.custodyAmount}>{formatPrice(custody.amount)}</Text>
            <Text style={styles.custodyHint}>
              {custody.ordersCount > 0 ? `${t.custodyOrders(custody.ordersCount)} · ${t.custodyHint}` : t.custodyEmpty}
            </Text>
          </View>
          <View style={styles.custodyDivider} />
          <View style={{ flex: 1 }}>
            <Text style={styles.custodyLabel}>{t.toCollectTitle}</Text>
            <Text style={styles.collectAmount}>{formatPrice(toCollect.amount)}</Text>
            <Text style={styles.custodyHint}>
              {toCollect.ordersCount > 0 ? t.custodyOrders(toCollect.ordersCount) : t.toCollectNone}
            </Text>
          </View>
        </View>
        {home.lastSettlement && (
          <Text style={[styles.custodyHint, styles.custodyFoot]}>
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

function open(url: string) {
  void Linking.openURL(url).catch(() => undefined);
}

function mapsUrl(parts: (string | null | undefined)[]): string {
  const q = [...parts.filter(Boolean), 'ليبيا'].join('، ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function OrderCard({ order }: { order: DriverOrder }) {
  const pickUp = useDriverPickUp();
  const deliver = useDriverDeliver();
  const [confirming, setConfirming] = useState<'pickup' | 'deliver' | null>(null);
  const cash = formatPrice(order.amountToCollect);
  const cod = order.paymentMethod === 'cod';
  const pieces = order.items.reduce((s, i) => s + i.quantity, 0);
  const error = pickUp.error ?? deliver.error;
  const onTheRoad = order.status === 'shipped';

  const pickupStop = (
    <Stop
      key="pickup"
      icon="storefront-outline"
      title={t.pickup}
      name={order.pickup.storeName}
      lines={[[order.pickup.district, order.pickup.address, order.pickup.city].filter(Boolean).join('، ')]}
      phone={order.pickup.phone}
      map={mapsUrl([order.pickup.address, order.pickup.district, order.pickup.city])}
      compact={onTheRoad}
    />
  );
  const d = order.dropoff;
  const dropoffStop = (
    <Stop
      key="dropoff"
      icon="location-outline"
      title={t.dropoff}
      name={d.name}
      lines={[[d.district, d.street, d.building].filter(Boolean).join('، '), d.city ?? '']}
      landmark={d.landmark}
      phone={d.phone}
      whatsapp
      map={mapsUrl([d.street, d.district, d.landmark, d.city])}
    />
  );

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.orderNo}>{t.order(order.orderNumber)}</Text>
        <View style={styles.row}>
          {order.isExpress && (
            <View style={styles.express}>
              <Ionicons name="flash" size={12} color={colors.sale} />
              <Text style={styles.expressText}>{t.express}</Text>
            </View>
          )}
          <StatusBadge status={order.status} />
        </View>
      </View>
      <Text style={[styles.muted, styles.rtl]}>
        {[
          order.estimatedDeliveryAt ? t.expected(formatLibyaTime(order.estimatedDeliveryAt)) : null,
          order.isExpress ? null : deliveryModeLabel(order.deliveryMode),
          t.items(pieces),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>

      {/* The stop that matters now comes first. */}
      {onTheRoad ? [dropoffStop, pickupStop] : [pickupStop, dropoffStop]}

      <View style={styles.items}>
        <Text style={styles.stopTitle}>{t.itemsTitle(pieces)}</Text>
        {order.items.map((i, k) => (
          <Text key={k} style={styles.itemLine}>
            {`• ${i.name}${i.size ? ` — ${t.size(i.size)}` : ''}${i.color ? ` — ${i.color}` : ''}  × ${i.quantity}`}
          </Text>
        ))}
      </View>

      <View style={[styles.cash, !cod && styles.cashPaid]}>
        <Ionicons name={cod ? 'cash-outline' : 'checkmark-circle-outline'} size={20} color={cod ? colors.success : colors.inkMuted} />
        <Text style={[styles.cashText, !cod && { color: colors.inkSecondary }]}>{cod ? t.collect(cash) : t.paidOnline}</Text>
      </View>

      {order.status === 'confirmed' && <Text style={styles.waiting}>{t.waitingStore}</Text>}

      {confirming ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmTitle}>
            {confirming === 'pickup'
              ? t.confirmPickUp(pieces)
              : cod
                ? t.confirmDeliver(cash)
                : t.confirmDeliverTitle}
          </Text>
          <View style={styles.row}>
            <Button
              title={confirming === 'pickup' ? t.yesPickedUp : cod ? t.yes : t.yesDelivered}
              loading={pickUp.isPending || deliver.isPending}
              onPress={() =>
                (confirming === 'pickup' ? pickUp : deliver).mutate(order.id, { onSettled: () => setConfirming(null) })
              }
              style={{ flex: 1 }}
            />
            <Button title={t.cancel} variant="outline" onPress={() => setConfirming(null)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : order.canPickUp ? (
        <Button title={t.pickedUp} onPress={() => setConfirming('pickup')} />
      ) : order.canDeliver ? (
        <Button title={cod ? t.delivered(cash) : t.deliveredNoCash} onPress={() => setConfirming('deliver')} />
      ) : null}
      {error && <Text style={styles.error}>{errorMessage(error)}</Text>}
    </View>
  );
}

function DoneRow({ order }: { order: DriverOrder }) {
  return (
    <View style={styles.doneRow}>
      <Ionicons name="checkmark-circle" size={20} color={colors.success} />
      <View style={{ flex: 1 }}>
        <Text style={styles.doneTitle}>
          {t.order(order.orderNumber)} · {order.dropoff.name}
        </Text>
        {order.cashCollectedAt && <Text style={[styles.muted, styles.rtl]}>{formatLibyaTime(order.cashCollectedAt)}</Text>}
      </View>
      <Text style={styles.doneCash}>
        {order.paymentMethod === 'cod' ? t.collected(formatPrice(order.amountToCollect)) : t.deliveredNoCash}
      </Text>
    </View>
  );
}

function Stop({
  icon,
  title,
  name,
  lines,
  landmark,
  phone,
  whatsapp,
  map,
  compact,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  name: string;
  lines: string[];
  landmark?: string | null;
  phone: string | null;
  whatsapp?: boolean;
  map: string;
  /** Already done (picked up): one line, no buttons. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <View style={[styles.stop, styles.row]}>
        <Ionicons name={icon} size={18} color={colors.inkMuted} />
        <Text style={styles.muted}>
          {title}: {name}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.stop}>
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <Ionicons name={icon} size={20} color={colors.primary} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.stopTitle}>{title}</Text>
          <Text style={styles.stopName}>{name}</Text>
          {lines.filter(Boolean).map((l, i) => (
            <Text key={i} style={styles.address}>
              {l}
            </Text>
          ))}
          {!!landmark && (
            <Text style={styles.landmark}>
              {t.landmark}: {landmark}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        {phone && <Action icon="call" label={t.call} a11y={`${t.call} ${name}`} onPress={() => open(`tel:${phone}`)} solid />}
        {phone && whatsapp && (
          <Action
            icon="logo-whatsapp"
            label={t.whatsapp}
            a11y={`${t.whatsapp} ${name}`}
            onPress={() => open(`https://wa.me/${whatsappNumber(phone)}`)}
          />
        )}
        <Action icon="navigate-outline" label={t.directions} a11y={`${t.directions} ${name}`} onPress={() => open(map)} />
      </View>
    </View>
  );
}

function Action({
  icon,
  label,
  a11y,
  onPress,
  solid,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  a11y: string;
  onPress: () => void;
  solid?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, solid && styles.actionSolid, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Ionicons name={icon} size={16} color={solid ? colors.white : colors.success} />
      <Text style={[styles.actionText, solid && { color: colors.white }]}>{label}</Text>
    </Pressable>
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
  rtl: { writingDirection: 'rtl' },
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
  custody: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  custodyRow: { flexDirection: 'row', gap: spacing.md },
  custodyDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  custodyLabel: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 22, color: colors.primarySoft },
  custodyAmount: { fontFamily: fonts.extraBold, fontSize: 28, lineHeight: 44, color: colors.white },
  collectAmount: { fontFamily: fonts.extraBold, fontSize: 22, lineHeight: 44, color: colors.white },
  custodyHint: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 19, color: colors.primarySoft },
  custodyFoot: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)', paddingTop: spacing.sm },
  group: { gap: spacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  section: { fontFamily: fonts.extraBold, fontSize: 17, lineHeight: 28, color: colors.ink },
  count: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 20, color: colors.white },
  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 24, color: colors.ink },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  orderNo: { fontFamily: fonts.extraBold, fontSize: 16, lineHeight: 26, color: colors.ink },
  express: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.saleSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  expressText: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 18, color: colors.sale },
  stop: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  stopTitle: { fontFamily: fonts.semiBold, fontSize: 12, lineHeight: 18, color: colors.inkMuted },
  stopName: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 26, color: colors.ink },
  address: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, color: colors.inkSecondary },
  landmark: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 22,
    color: colors.primaryDark,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.success,
    paddingHorizontal: 14,
  },
  actionSolid: { backgroundColor: colors.success },
  actionText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 22, color: colors.success },
  items: {
    gap: 2,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemLine: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, color: colors.ink, writingDirection: 'rtl' },
  cash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  cashPaid: { backgroundColor: colors.surfaceMuted },
  cashText: { fontFamily: fonts.extraBold, fontSize: 16, lineHeight: 26, color: colors.success },
  waiting: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 20, color: colors.inkSecondary },
  confirm: { gap: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: spacing.sm },
  confirmTitle: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 24, color: colors.primaryDark },
  doneList: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, ...shadow.card },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  doneTitle: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 22, color: colors.ink },
  doneCash: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 20, color: colors.success },
  error: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 20, color: colors.danger },
});
