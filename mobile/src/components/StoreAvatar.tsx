import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { darken, lighten } from '@/lib/color';
import { colors, fonts } from '@/theme';

/** Cinzel capitals are ~0.8em wide; keep the word inside the circle. */
function wordSize(text: string, size: number): number {
  return Math.min(size * 0.22, (size * 0.72) / (text.length * 0.9));
}

/** Below this size a full wordmark is unreadable, so show its first letter as a monogram. */
const MONOGRAM_BELOW = 52;

/** Round store logo; stores without an uploaded logo get their serif wordmark (LUNA, NOVA…). */
export function StoreAvatar({
  logoUrl,
  logoText,
  brandColor,
  size = 64,
}: {
  logoUrl?: string | null;
  logoText: string;
  brandColor?: string | null;
  size?: number;
}) {
  const tone = brandColor ?? colors.primary;
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: lighten(tone, 0.82) },
      ]}
    >
      {logoUrl ? (
        <Image source={{ uri: logoUrl }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text
          style={[
            styles.word,
            {
              fontSize: size < MONOGRAM_BELOW ? size * 0.42 : wordSize(logoText, size),
              color: darken(tone, 0.35),
            },
          ]}
          numberOfLines={1}
        >
          {size < MONOGRAM_BELOW ? logoText.charAt(0) : logoText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 2,
  },
  word: { fontFamily: fonts.brand, letterSpacing: 1, writingDirection: 'ltr', color: colors.ink },
});
