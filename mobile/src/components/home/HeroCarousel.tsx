import { mediaUrl } from '@/api/client';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Banner } from '@/api/types';
import { colors, fonts, radius, spacing } from '@/theme';

const ROTATE_MS = 5000;

/**
 * Pink hero from the reference: headline + "تسوقي الآن" on the start side, visual on the end side,
 * page dots underneath. Rotates automatically; dots switch banners. Banners without a photo get a
 * branded illustration until real campaign photos are uploaded (banners.image_url).
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
      <Pressable style={styles.card} onPress={() => b.link && router.push(b.link as Href)}>
        <View style={styles.text}>
          <Text style={styles.title}>{b.title}</Text>
          {b.cta && (
            <View style={styles.cta}>
              <Text style={styles.ctaText}>{b.cta}</Text>
            </View>
          )}
          {b.subtitle && <Text style={styles.subtitle}>{b.subtitle}</Text>}
        </View>
        <View style={styles.visual}>
          {b.imageUrl ? (
            <Image source={{ uri: mediaUrl(b.imageUrl) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <>
              <View style={[styles.blob, styles.blobLarge]} />
              <View style={[styles.blob, styles.blobSmall]} />
              <View style={styles.iconRing}>
                <MaterialCommunityIcons name="hanger" size={46} color={colors.white} />
              </View>
            </>
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
    height: 168,
    borderRadius: radius.lg,
    backgroundColor: colors.heroBackground,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  text: { flex: 1.15, justifyContent: 'center', paddingHorizontal: spacing.md, gap: 8 },
  title: { fontFamily: fonts.extraBold, fontSize: 22, lineHeight: 32, color: colors.primary },
  cta: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  subtitle: { fontFamily: fonts.regular, fontSize: 11, color: colors.primaryDark },
  visual: { flex: 0.85, alignItems: 'center', justifyContent: 'center' },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: colors.primary },
  blobLarge: { width: 170, height: 170, opacity: 0.12, bottom: -40, end: -30 },
  blobSmall: { width: 60, height: 60, opacity: 0.1, top: 12, start: 6 },
  iconRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { width: 18, backgroundColor: colors.primary },
});
