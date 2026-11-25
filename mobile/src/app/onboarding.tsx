import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BRAND } from '@/constants/brand';
import { ar } from '@/i18n/ar';
import { finishOnboarding } from '@/lib/onboarding';
import { colors, fonts, radius, spacing } from '@/theme';

const FABRIC = require('../../assets/brand/navy-fabric-portrait.jpg');
const LOGO = require('../../assets/brand/logo-reversed.png');
const t = ar.onboarding;
/** Slide 1 shows the logo; the next ones a silver line icon (no people: owner decision). */
const ICONS: (keyof typeof Ionicons.glyphMap | null)[] = [null, 'storefront-outline', 'bag-check-outline'];

/** «التعريف» — three slides on navy fabric, shown once on the app's first launch. */
export default function OnboardingScreen() {
  const [i, setI] = useState(0);
  const last = i === t.slides.length - 1;
  const slide = t.slides[i]!;
  const icon = ICONS[i];

  const done = async () => {
    await finishOnboarding();
    router.replace('/');
  };

  return (
    <View style={styles.screen}>
      <Image source={FABRIC} style={StyleSheet.absoluteFill} contentFit="cover" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          {!last && (
            <Pressable onPress={() => void done()} hitSlop={12} accessibilityRole="button">
              <Text style={styles.skip}>{t.skip}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.center}>
          {icon ? (
            <View style={styles.iconRing}>
              <Ionicons name={icon} size={46} color={colors.silver} />
            </View>
          ) : (
            <Image
              source={LOGO}
              style={styles.logo}
              contentFit="contain"
              accessibilityLabel={`${BRAND.wordmark} — ${BRAND.descriptorEn}`}
            />
          )}
          <Text style={styles.title}>{slide.title}</Text>
          <View style={styles.rule} />
          <Text style={styles.body}>{slide.body}</Text>
        </View>

        <View style={styles.bottom}>
          <View style={styles.dots}>
            {t.slides.map((s, k) => (
              <Pressable
                key={s.title}
                onPress={() => setI(k)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={s.title}
                style={[styles.dot, k === i && styles.dotOn]}
              />
            ))}
          </View>
          <Pressable
            onPress={() => (last ? void done() : setI(i + 1))}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>{last ? t.start : t.next}</Text>
          </Pressable>
          <Text style={styles.descriptor}>{BRAND.descriptorEn}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.primary },
  safe: { flex: 1, paddingHorizontal: spacing.lg },
  top: { height: 44, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  skip: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.silver },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  logo: { width: 190, height: 218, marginBottom: spacing.sm },
  iconRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: 'rgba(201,201,201,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontFamily: fonts.semiBold, fontSize: 24, lineHeight: 36, color: colors.white, textAlign: 'center' },
  rule: { width: 36, height: 1, backgroundColor: colors.silver, opacity: 0.7 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 26, color: colors.silver, textAlign: 'center', maxWidth: 320 },
  bottom: { gap: spacing.md, paddingBottom: spacing.lg, alignItems: 'stretch' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(201,201,201,0.4)' },
  dotOn: { width: 20, backgroundColor: colors.white },
  cta: {
    minHeight: 50,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: fonts.semiBold, fontSize: 16, lineHeight: 24, color: colors.primary },
  descriptor: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 3,
    color: colors.silver,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
});
