import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHome, useProducts } from '@/api/hooks';
import type { Feed } from '@/api/types';
import { AppHeader } from '@/components/home/AppHeader';
import { FeedTabs } from '@/components/home/FeedTabs';
import { HeroCarousel } from '@/components/home/HeroCarousel';
import { SearchBar } from '@/components/home/SearchBar';
import { LookStrip } from '@/components/LookStrip';
import { ProductCard } from '@/components/ProductCard';
import { QueryState } from '@/components/QueryState';
import { SectionHeader } from '@/components/SectionHeader';
import { StoreAvatar } from '@/components/StoreAvatar';
import { ar } from '@/i18n/ar';
import { colors, fonts, spacing } from '@/theme';

/** Home, laid out like the approved reference: header → search → feed tabs → hero →
 *  picked products → "كمّل اللوك" → picked stores. */
export default function HomeScreen() {
  const [feed, setFeed] = useState<Feed>('for_you');
  const home = useHome();
  const products = useProducts({ feed, limit: 10 });

  const refreshing = home.isRefetching || products.isRefetching;
  const refresh = () => {
    home.refetch();
    products.refetch();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <SearchBar />
        <FeedTabs value={feed} onChange={setFeed} />

        <QueryState query={home} minHeight={180}>
          {(data) => <HeroCarousel banners={data.banners} />}
        </QueryState>

        <View>
          <SectionHeader
            title={ar.home.pickedForYou}
            onSeeAll={() =>
              router.push({ pathname: '/products', params: { feed, title: ar.home.feeds[feed] } })
            }
          />
          <QueryState query={products} minHeight={250}>
            {(items) => (
              <FlatList
                horizontal
                data={items}
                keyExtractor={(p) => p.id}
                renderItem={({ item }) => <ProductCard product={item} width={150} />}
                ListEmptyComponent={
                  <Text style={styles.empty}>{feed === 'offers' ? ar.home.offersEmpty : ar.products.empty}</Text>
                }
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              />
            )}
          </QueryState>
        </View>

        {home.data?.featuredLook && (
          <View>
            <SectionHeader
              title={ar.home.completeTheLook}
              onSeeAll={() =>
                router.push({ pathname: '/look/[id]', params: { id: home.data!.featuredLook!.slug } })
              }
            />
            <LookStrip look={home.data.featuredLook} />
          </View>
        )}

        {home.data && home.data.featuredStores.length > 0 && (
          <View>
            <SectionHeader title={ar.home.storesForYou} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stores}>
              {home.data.featuredStores.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.store}
                  onPress={() => router.push({ pathname: '/store/[slug]', params: { slug: s.slug } })}
                >
                  <StoreAvatar logoUrl={s.logoUrl} logoText={s.logoText} brandColor={s.brandColor} />
                  <Text style={styles.storeName} numberOfLines={1}>
                    {s.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  rail: { paddingHorizontal: spacing.md, gap: 10, paddingBottom: 6 },
  stores: { paddingHorizontal: spacing.md, gap: spacing.md },
  store: { alignItems: 'center', gap: 6, width: 72 },
  empty: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkMuted, paddingVertical: spacing.lg },
  storeName: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.ink },
});
