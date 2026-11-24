import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useCategories, useProducts } from '@/api/hooks';
import type { Category, Feed } from '@/api/types';
import { CategoryChips } from '@/components/CategoryChips';
import { ProductGrid } from '@/components/ProductGrid';
import { EmptyState, QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ar } from '@/i18n/ar';
import { colors, spacing } from '@/theme';

const FEEDS: Feed[] = ['for_you', 'trending', 'offers', 'nearby', 'new'];

/** Product results for a feed, category, store or search: /products?feed=&category=&q=&title= */
export default function ProductsScreen() {
  const params = useLocalSearchParams<{ feed?: string; category?: string; q?: string; title?: string }>();
  const feed = FEEDS.find((f) => f === params.feed);
  // A main category (or one of its sub-categories) shows «الكل · فساتين · …» to narrow the list.
  const categories = useCategories();
  const main: Category | undefined = params.category
    ? categories.data?.find(
        (c) => c.slug === params.category || c.children.some((k) => k.slug === params.category),
      )
    : undefined;
  const [selected, setSelected] = useState(params.category);
  const category = selected ?? params.category;
  const products = useProducts({ feed, category, q: params.q, limit: 50 });

  return (
    <View style={styles.screen}>
      <ScreenHeader title={main?.name ?? params.title ?? ar.products.results} />
      {main && main.children.length > 0 && category && (
        <CategoryChips main={main} value={category} onChange={setSelected} />
      )}
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
