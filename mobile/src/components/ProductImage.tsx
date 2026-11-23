import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { lighten, luminance } from '@/lib/color';
import { colors } from '@/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

function iconFor(category: string | null | undefined, name = ''): IconName {
  if (/نظار/.test(name)) return 'sunglasses';
  if (/قلادة|عقد/.test(name)) return 'necklace';
  if (/أقراط|حلق|خاتم/.test(name)) return 'diamond-stone';
  if (/رياضي|سنيكر/.test(name)) return 'shoe-sneaker';
  switch (category) {
    case 'bags':
      return 'purse';
    case 'shoes':
      return 'shoe-heel';
    case 'watches':
      return 'watch';
    case 'accessories':
      return 'sunglasses';
    case 'men':
    case 'kids':
      return 'tshirt-crew';
    default:
      return 'hanger';
  }
}

interface Props {
  uri: string | null | undefined;
  colorHex?: string | null;
  category?: string | null;
  name?: string;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
}

/**
 * Product photo; until real photos are uploaded (or if one fails to load) it shows a
 * tinted tile in the product's own color with a matching garment icon.
 */
export function ProductImage({ uri, colorHex, category, name, style, iconSize = 42 }: Props) {
  const [failed, setFailed] = useState(false);
  const base = colorHex ?? colors.primary;

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[styles.fill, style as object]}
        contentFit="cover"
        transition={150}
        onError={() => setFailed(true)}
      />
    );
  }

  const iconColor = luminance(base) > 0.75 ? colors.inkFaint : base;
  return (
    <View style={[styles.fill, styles.placeholder, { backgroundColor: lighten(base, 0.86) }, style]}>
      <MaterialCommunityIcons name={iconFor(category, name)} size={iconSize} color={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
