import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCategories } from '@/api/hooks';
import { SearchBar } from '@/components/home/SearchBar';
import { ProductImage } from '@/components/ProductImage';
import { QueryState } from '@/components/QueryState';
import { ar } from '@/i18n/ar';
import { colors, fonts, radius, spacing } from '@/theme';

// Fallback tints when a category has no colour set in the back office.
// Fallback tile tints in the STYLO palette (navy, teal, sand, slate).
const TONES = ['#0B1F2E', '#355E5A', '#8A7A5C', '#4A5560', '#7C8A8F', '#A79F8E', '#5F6870'];

export default function CategoriesScreen() {
  const categories = useCategories();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>{ar.categories.title}</Text>
      <ScrollView contentContainerStyle={styles.content}>
        <SearchBar />
        <QueryState query={categories}>
          {(items) => (
            <View style={styles.grid}>
              {items.map((c, i) => (
                <Pressable
                  key={c.id}
                  style={styles.tile}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name}، ${ar.categories.products(c.productCount)}`}
                  onPress={() => router.push({ pathname: '/products', params: { category: c.slug, title: c.name } })}
                >
                  <View style={styles.art}>
                    <ProductImage
                      uri={c.imageUrl}
                      category={c.slug}
                      icon={c.icon}
                      colorHex={c.color ?? TONES[i % TONES.length]}
                      iconSize={38}
                    />
                  </View>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.count}>{ar.categories.products(c.productCount)}</Text>
                </Pressable>
              ))}
            </View>
          )}
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
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.md, gap: 12 },
  tile: { width: '30.5%', alignItems: 'center', gap: 4 },
  art: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden' },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  count: { fontFamily: fonts.regular, fontSize: 11, color: colors.inkMuted },
});
