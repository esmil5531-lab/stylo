import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useWishlist } from '@/api/hooks';
import { ProductGrid } from '@/components/ProductGrid';
import { EmptyState, QueryState } from '@/components/QueryState';
import { ar } from '@/i18n/ar';
import { colors, fonts, spacing } from '@/theme';

export default function WishlistScreen() {
  const wishlist = useWishlist();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>{ar.wishlist.title}</Text>
      <ScrollView contentContainerStyle={styles.content}>
        <QueryState query={wishlist}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState icon="heart-outline" title={ar.wishlist.empty} hint={ar.wishlist.emptyHint} />
            ) : (
              <ProductGrid products={items} />
            )
          }
        </QueryState>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  content: { paddingBottom: spacing.xl },
});
