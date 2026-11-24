import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useToggleWishlist } from '@/api/hooks';
import { useRequireSignIn } from '@/lib/requireSignIn';
import { colors } from '@/theme';

export function WishlistButton({
  productId,
  initial,
  size = 16,
}: {
  productId: string;
  initial: boolean;
  size?: number;
}) {
  const toggle = useToggleWishlist();
  // Optimistic: flip immediately, roll back on failure.
  const [on, setOn] = useState(initial);
  const requireSignIn = useRequireSignIn();
  const press = () => requireSignIn(() => {
    const next = !on;
    setOn(next);
    toggle.mutate({ productId, wishlisted: next }, { onError: () => setOn(!next) });
  });
  return (
    <Pressable
      onPress={press}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={on ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
      style={[styles.btn, { width: size + 14, height: size + 14, borderRadius: (size + 14) / 2 }]}
    >
      <Ionicons name={on ? 'heart' : 'heart-outline'} size={size} color={on ? colors.primary : colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
});
