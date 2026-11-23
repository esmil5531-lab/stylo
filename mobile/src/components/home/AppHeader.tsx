import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCart } from '@/api/hooks';
import { BRAND } from '@/constants/brand';
import { colors, fonts, spacing } from '@/theme';

/** Reference top bar: bag + heart (start/right), STYLO wordmark (center), bell (end/left). */
export function AppHeader() {
  const cart = useCart();
  const count = cart.data?.itemsCount ?? 0;
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
        <Pressable hitSlop={8} accessibilityLabel="الإشعارات">
          <Ionicons name="notifications-outline" size={24} color={colors.ink} />
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
