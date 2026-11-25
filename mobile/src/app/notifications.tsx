import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useNotifications } from '@/api/hooks';
import type { NotificationItem } from '@/api/types';
import { EmptyState, QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SignInPrompt } from '@/components/SignInPrompt';
import { ar } from '@/i18n/ar';
import { formatWhen } from '@/lib/format';
import { isUnread, markNotificationsSeen, useNotificationsSeenAt } from '@/lib/notificationsSeen';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

const t = ar.notifications;

const ICON: Record<NotificationItem['status'], keyof typeof Ionicons.glyphMap> = {
  pending: 'receipt-outline',
  confirmed: 'checkmark-circle-outline',
  processing: 'cube-outline',
  shipped: 'bicycle-outline',
  delivered: 'gift-outline',
  cancelled: 'close-circle-outline',
};

/** «الإشعارات» (the bell on the home screen): the latest updates of the customer's orders. */
export default function NotificationsScreen() {
  const { signedIn } = useSession();
  const query = useNotifications();
  const seenAt = useNotificationsSeenAt();
  // Highlight what was new when the screen opened, then mark everything as seen.
  const [seenAtOpen, setSeenAtOpen] = useState<string | null | undefined>(undefined);
  const newest = query.data?.[0]?.at;

  if (newest && seenAtOpen === undefined) setSeenAtOpen(seenAt); // once, during render (not in an effect)

  useEffect(() => {
    if (newest) void markNotificationsSeen(newest);
  }, [newest]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t.title} />
      {!signedIn ? (
        <SignInPrompt />
      ) : (
        <QueryState query={query} minHeight={300}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState icon="notifications-outline" title={t.empty} hint={t.emptyHint} />
            ) : (
              <ScrollView
                contentContainerStyle={styles.list}
                refreshControl={
                  <RefreshControl
                    refreshing={query.isRefetching}
                    onRefresh={() => void query.refetch()}
                    tintColor={colors.primary}
                  />
                }
              >
                {items.map((n) => (
                  <Row key={n.id} item={n} unread={seenAtOpen !== undefined && isUnread(n.at, seenAtOpen)} />
                ))}
              </ScrollView>
            )
          }
        </QueryState>
      )}
    </View>
  );
}

function Row({ item, unread }: { item: NotificationItem; unread: boolean }) {
  const tone =
    item.status === 'cancelled'
      ? { bg: colors.saleSoft, fg: colors.sale }
      : item.status === 'delivered'
        ? { bg: colors.successSoft, fg: colors.success }
        : { bg: colors.primarySoft, fg: colors.primary };
  return (
    <Pressable
      onPress={() => router.push(`/orders/${item.orderId}` as Href)}
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
    >
      <View style={[styles.icon, { backgroundColor: tone.bg }]}>
        <Ionicons name={ICON[item.status]} size={22} color={tone.fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t.status[item.status]}</Text>
          {unread && (
            <View style={styles.newBadge}>
              <Text style={styles.newText}>{t.newBadge}</Text>
            </View>
          )}
        </View>
        <Text style={styles.sub}>{t.order(item.orderNumber, item.storeName)}</Text>
        {item.note && <Text style={styles.reason}>{t.reason(item.note)}</Text>}
        <Text style={styles.time}>{formatWhen(item.at)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  rowUnread: { borderWidth: 1, borderColor: colors.primary },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 24, color: colors.ink, flexShrink: 1 },
  newBadge: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 8 },
  newText: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 18, color: colors.white },
  sub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.inkSecondary },
  reason: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 20, color: colors.sale },
  time: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.inkMuted, writingDirection: 'rtl' },
});
