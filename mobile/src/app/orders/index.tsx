import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useOrders } from '@/api/hooks';
import { EmptyState, QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { StoreAvatar } from '@/components/StoreAvatar';
import { ar } from '@/i18n/ar';
import { formatDate, formatPrice } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

export default function OrdersScreen() {
  const orders = useOrders();
  return (
    <View style={styles.screen}>
      <ScreenHeader title={ar.orders.title} />
      <ScrollView contentContainerStyle={styles.content}>
        <QueryState query={orders} minHeight={300}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState icon="receipt-outline" title={ar.orders.empty} />
            ) : (
              items.map((o) => (
                <Pressable
                  key={o.id}
                  style={styles.card}
                  onPress={() => router.push({ pathname: '/orders/[id]', params: { id: o.id } })}
                >
                  <StoreAvatar logoText={o.store.logoText} brandColor={o.store.brandColor} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={styles.row}>
                      <Text style={styles.number}>{ar.orders.number(o.orderNumber)}</Text>
                      <StatusBadge status={o.status} />
                    </View>
                    <Text style={styles.meta}>
                      {o.store.name} · {ar.orders.items(o.itemsCount)} · {formatDate(o.placedAt)}
                    </Text>
                    <View style={styles.row}>
                      <Text style={styles.meta}>
                        {o.deliveryMode === 'unified' ? ar.delivery.unified : ar.delivery.fastest}
                      </Text>
                      <Text style={styles.total}>{formatPrice(o.total, o.currency)}</Text>
                    </View>
                  </View>
                </Pressable>
              ))
            )
          }
        </QueryState>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted },
  total: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.ink },
});
