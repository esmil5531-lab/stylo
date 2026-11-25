import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCart } from '@/api/hooks';
import { ar } from '@/i18n/ar';
import { colors, fonts } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Own label: the default one clips Arabic ascenders/descenders. */
function label(text: string) {
  function TabLabel({ color }: { color: ColorValue }) {
    return <Text style={{ fontFamily: fonts.semiBold, fontSize: 11, lineHeight: 18, color }}>{text}</Text>;
  }
  return TabLabel;
}

function icon(outline: IconName, filled: IconName) {
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? filled : outline} size={23} color={color as string} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const cart = useCart();
  const insets = useSafeAreaInsets();
  const count = cart.data?.itemsCount ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.ink,
        // Arabic line metrics need more room than the default bar gives the label.
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: ar.tabs.home,
          tabBarLabel: label(ar.tabs.home), tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen
        name="categories"
        options={{ title: ar.tabs.categories,
          tabBarLabel: label(ar.tabs.categories), tabBarIcon: icon('grid-outline', 'grid') }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: ar.tabs.cart,
          tabBarLabel: label(ar.tabs.cart),
          tabBarIcon: icon('cart-outline', 'cart'),
          tabBarBadge: count > 0 ? count : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontFamily: fonts.bold, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{ title: ar.tabs.wishlist,
          tabBarLabel: label(ar.tabs.wishlist), tabBarIcon: icon('heart-outline', 'heart') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: ar.tabs.account,
          tabBarLabel: label(ar.tabs.account), tabBarIcon: icon('person-outline', 'person') }}
      />
    </Tabs>
  );
}
