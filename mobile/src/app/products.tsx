import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useProducts } from '@/api/hooks';
import type { Feed } from '@/api/types';
import { ProductGrid } from '@/components/ProductGrid';
import { EmptyState, QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ar } from '@/i18n/ar';
import { colors, spacing } from '@/theme';

const FEEDS: Feed[] = ['for_you', 'trending', 'new', 'nearby'];

/** Product results for a feed, category, store or search: /products?feed=&category=&q=&title= */
export default function ProductsScreen() {
  const params = useLocalSearchParams<{ feed?: string; category?: string; q?: string; title?: string }>();
  const feed = FEEDS.find((f) => f === params.feed);
  const products = useProducts({ feed, category: params.category, q: params.q, limit: 50 });

  return (
    <View style={styles.screen}>
      <ScreenHeader title={params.title ?? ar.products.results} />
      <ScrollView contentContainerStyle={styles.content}>
        <QueryState query={products} minHeight={300}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState icon="search" title={ar.products.empty} />
            ) : (
              <ProductGrid products={items} />
            )
          }
        </QueryState>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingVertical: spacing.sm, paddingBottom: spacing.xl },
});
