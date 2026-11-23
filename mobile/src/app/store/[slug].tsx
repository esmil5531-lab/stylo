import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useStore } from '@/api/hooks';
import { ProductGrid } from '@/components/ProductGrid';
import { QueryState } from '@/components/QueryState';
import { Rating } from '@/components/Rating';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StoreAvatar } from '@/components/StoreAvatar';
import { ar } from '@/i18n/ar';
import { formatPrice } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

export default function StoreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const store = useStore(slug);
  return (
    <View style={styles.screen}>
      <ScreenHeader title={store.data?.name ?? ''} />
      <QueryState query={store} minHeight={400}>
        {(s) => (
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl, gap: spacing.md }}>
            <View style={styles.hero}>
              <StoreAvatar logoUrl={s.logoUrl} logoText={s.logoText} brandColor={s.brandColor} size={84} />
              <Text style={styles.name}>{s.name}</Text>
              <Rating value={s.rating} count={s.ratingCount} size={14} />
              <Text style={styles.meta}>
                {s.city} · {ar.store.prepTime(s.prepHours)}
              </Text>
              <Text style={styles.meta}>
                {ar.delivery.fee}: {formatPrice(s.deliveryFee)}
              </Text>
            </View>
            <Text style={styles.section}>{ar.store.products}</Text>
            <ProductGrid products={s.products} />
          </ScrollView>
        )}
      </QueryState>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: {
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  name: { fontFamily: fonts.extraBold, fontSize: 20, color: colors.ink },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted },
  section: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink, paddingHorizontal: spacing.md },
});
