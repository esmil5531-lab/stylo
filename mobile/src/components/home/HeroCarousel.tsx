import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { Banner } from '@/api/types';
import { directionalIcons } from '@/i18n/rtl';
import { colors, fonts, radius, spacing } from '@/theme';

const ROTATE_MS = 5000;
const FABRIC = require('../../../assets/brand/navy-fabric-wide.jpg');
const MARK = require('../../../assets/brand/mark-silver.png');

/**
 * Home hero in the STYLO reference style: a dark editorial card — the campaign photo (with a navy
 * veil for legibility) or, without a photo, navy fabric with the silver monogram — white headline,
 * silver line and an ivory «اكتشفي ←» button. Rotates; the dots switch banners.
 */
export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % banners.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [banners.length, index]);

  const b = banners[index % Math.max(banners.length, 1)];
  if (!b) return null;

  return (
    <View>
      <Pressable
        style={styles.card}
        onPress={() => b.link && router.push(b.link as Href)}
        accessibilityRole="link"
        accessibilityLabel={[b.title, b.subtitle].filter(Boolean).join('. ')}
      >
        {b.imageUrl ? (
          <>
            <Image source={{ uri: mediaUrl(b.imageUrl) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={[StyleSheet.absoluteFill, styles.veil]} />
          </>
        ) : (
          <>
            <Image source={FABRIC} style={StyleSheet.absoluteFill} contentFit="cover" />
            <Image source={MARK} style={styles.mark} contentFit="contain" />
          </>
        )}
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2}>
            {b.title}
          </Text>
          {b.subtitle && (
            <Text style={styles.subtitle} numberOfLines={2}>
              {b.subtitle}
            </Text>
          )}
          {b.cta && (
            <View style={styles.cta}>
              <Text style={styles.ctaText}>{b.cta}</Text>
              <Ionicons name={directionalIcons.forward} size={14} color={colors.primary} />
            </View>
          )}
        </View>
      </Pressable>
      {banners.length > 1 && (
        <View style={styles.dots}>
          {banners.map((banner, i) => (
            <Pressable
              key={banner.id}
              onPress={() => setIndex(i)}
              hitSlop={6}
              accessibilityLabel={banner.title}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    height: 188,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  veil: { backgroundColor: colors.overlay },
  mark: { position: 'absolute', width: 120, height: 120, end: -14, bottom: -10, opacity: 0.55 },
  text: { width: '68%', paddingHorizontal: spacing.lg, gap: 6 },
  title: { fontFamily: fonts.semiBold, fontSize: 24, lineHeight: 34, color: colors.white },
  subtitle: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.silver },
  cta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  ctaText: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 20, color: colors.primary },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  dotActive: { width: 18, backgroundColor: colors.primary },
});
