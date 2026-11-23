import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BRAND } from '@/constants/brand';
import { ar } from '@/i18n/ar';
import { colors, fonts, radius, spacing } from '@/theme';

const FEATURED_STORES = [
  { id: 'noura-boutique', name: 'بوتيك نورة', tag: 'أزياء نسائية' },
  { id: 'urban-man', name: 'أوربان مان', tag: 'أزياء رجالية' },
  { id: 'little-steps', name: 'خطوات صغيرة', tag: 'ملابس أطفال' },
];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.brand}>{BRAND.nameAr}</Text>
          <Text style={styles.tagline}>{BRAND.taglineAr}</Text>
        </View>

        <TextInput
          placeholder={ar.home.searchPlaceholder}
          placeholderTextColor={colors.inkMuted}
          style={styles.search}
        />

        <Text style={styles.sectionTitle}>{ar.home.categories}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {ar.categories.map((c) => (
            <View key={c} style={styles.chip}>
              <Text style={styles.chipText}>{c}</Text>
            </View>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>{ar.home.featuredStores}</Text>
        {FEATURED_STORES.map((s) => (
          <View key={s.id} style={styles.storeCard}>
            <View style={styles.storeLogo}>
              <Text style={styles.storeLogoText}>{s.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.storeName}>{s.name}</Text>
              <Text style={styles.storeTag}>{s.tag}</Text>
            </View>
          </View>
        ))}

        <Link href="/orders" asChild>
          <Pressable style={styles.cta}>
            <Text style={styles.ctaText}>{ar.home.viewOrders}</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.md, gap: spacing.md },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  brand: { color: '#FFFFFF', fontSize: 40, fontFamily: fonts.extraBold },
  tagline: { color: colors.accent, fontSize: 18, fontFamily: fonts.semiBold },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
  sectionTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.ink },
  chips: { gap: spacing.sm },
  chip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { color: colors.ink, fontSize: 14, fontFamily: fonts.semiBold },
  storeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  storeLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeLogoText: { fontSize: 20, fontFamily: fonts.bold, color: colors.accent },
  storeName: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  storeTag: { fontSize: 13, fontFamily: fonts.regular, color: colors.inkMuted, marginTop: 2 },
  cta: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontFamily: fonts.bold },
});
