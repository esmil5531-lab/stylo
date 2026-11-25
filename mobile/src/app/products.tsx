import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { useCategories, useProductFacets, useProductPages, type ProductSort } from '@/api/hooks';
import type { Category, Feed } from '@/api/types';
import { Button } from '@/components/Button';
import { CategoryChips } from '@/components/CategoryChips';
import { activeFilterCount, FilterSheet, ListToolbar, SortSheet, type ListFilters } from '@/components/product/ListControls';
import { ProductGrid } from '@/components/ProductGrid';
import { EmptyState, QueryState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ar } from '@/i18n/ar';
import { colors, spacing } from '@/theme';

const FEEDS: Feed[] = ['for_you', 'trending', 'offers', 'nearby', 'new'];
/** Load the next page this far (px) before the end of the list. */
const PRELOAD = 800;

/**
 * Product results for a feed, category, store or search (/products?feed=&category=&q=&title=):
 * «N منتج · ترتيب · فلترة», 20 at a time with the next page loading on scroll.
 */
export default function ProductsScreen() {
  const params = useLocalSearchParams<{ feed?: string; category?: string; q?: string; title?: string }>();
  const feed = FEEDS.find((f) => f === params.feed);
  // A main category (or one of its sub-categories) shows «الكل · فساتين · …» to narrow the list.
  const categories = useCategories();
  const main: Category | undefined = params.category
    ? categories.data?.find((c) => c.slug === params.category || c.children.some((k) => k.slug === params.category))
    : undefined;
  const [selected, setSelected] = useState(params.category);
  const category = selected ?? params.category;
  const [sort, setSort] = useState<ProductSort | undefined>(undefined);
  const [filters, setFilters] = useState<ListFilters>({ sizes: [] });
  const [sheet, setSheet] = useState<'sort' | 'filter' | null>(null);

  const scope = { feed, category, q: params.q };
  const pages = useProductPages({ ...scope, sort, ...filters });
  const facets = useProductFacets(scope);
  const items = pages.data?.pages.flatMap((p) => p.items) ?? [];
  const total = pages.data?.pages[0]?.total;
  const filtered = activeFilterCount(filters) > 0;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={main?.name ?? params.title ?? ar.products.results} />
      {main && main.children.length > 0 && category && <CategoryChips main={main} value={category} onChange={setSelected} />}
      <ListToolbar
        total={total}
        sortLabel={ar.products.sorts[sort ?? 'default']}
        filters={activeFilterCount(filters)}
        onSort={() => setSheet('sort')}
        onFilter={() => setSheet('filter')}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        scrollEventThrottle={200}
        onScroll={({ nativeEvent: e }) => {
          const nearEnd = e.contentOffset.y + e.layoutMeasurement.height > e.contentSize.height - PRELOAD;
          if (nearEnd && pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
        }}
      >
        <QueryState query={pages} minHeight={300}>
          {() =>
            items.length === 0 ? (
              <EmptyState
                icon="search"
                title={ar.products.empty}
                hint={filtered ? ar.products.emptyFiltered : undefined}
                action={
                  filtered ? (
                    <Button title={ar.products.clear} variant="outline" onPress={() => setFilters({ sizes: [] })} />
                  ) : undefined
                }
              />
            ) : (
              <>
                <ProductGrid products={items} />
                {pages.isFetchingNextPage && <ActivityIndicator color={colors.primary} style={styles.more} />}
              </>
            )
          }
        </QueryState>
      </ScrollView>

      <SortSheet visible={sheet === 'sort'} value={sort} onChange={setSort} onClose={() => setSheet(null)} />
      {sheet === 'filter' && (
        <FilterSheet visible facets={facets.data} value={filters} onApply={setFilters} onClose={() => setSheet(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingVertical: spacing.md, paddingBottom: spacing.xl },
  more: { marginTop: spacing.md },
});
