import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCart, useNotifications } from '@/api/hooks';
import { BRAND } from '@/constants/brand';
import { ar } from '@/i18n/ar';
import { isUnread, useNotificationsSeenAt } from '@/lib/notificationsSeen';
import { colors, fonts, spacing } from '@/theme';

/** Reference top bar: bag + heart (start/right), STYLO wordmark (center), bell (end/left). */
export function AppHeader() {
  const cart = useCart();
  const count = cart.data?.itemsCount ?? 0;
  const notes = useNotifications();
  const seenAt = useNotificationsSeenAt();
  const unread = (notes.data ?? []).filter((n) => isUnread(n.at, seenAt)).length;
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        <Pressable onPress={() => router.navigate('/cart')} hitSlop={8} accessibilityLabel="السلة">
          <Ionicons name="bag-handle-outline" size={24} color={colors.ink} />
          {count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={() => router.navigate('/wishlist')} hitSlop={8} accessibilityLabel="المفضلة">
          <Ionicons name="heart-outline" size={24} color={colors.ink} />
        </Pressable>
      </View>
      <Text style={styles.logo} accessibilityRole="header">
        {BRAND.wordmark}
      </Text>
      <View style={[styles.side, styles.end]}>
        <Pressable
          onPress={() => router.push('/notifications' as Href)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? ar.notifications.bellUnread(unread) : ar.notifications.bell}
        >
          <Ionicons name="notifications-outline" size={24} color={colors.ink} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  side: { flexDirection: 'row', alignItems: 'center', gap: 14, width: 80 },
  end: { justifyContent: 'flex-end' },
  logo: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.brand,
    fontSize: 28,
    letterSpacing: 2,
    color: colors.primary,
    writingDirection: 'ltr',
  },
  badge: {
    position: 'absolute',
    top: -4,
    end: -6,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontFamily: fonts.bold, fontSize: 10, lineHeight: 14 },
});
