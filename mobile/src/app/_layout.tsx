import {
  Cairo_400Regular,
  Cairo_600SemiBold,
  Cairo_700Bold,
  Cairo_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/cairo';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { BRAND } from '@/constants/brand';
import { ar } from '@/i18n/ar';
import { ensureRTL } from '@/i18n/rtl';
import { colors, fonts } from '@/theme';

ensureRTL();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
    Cairo_800ExtraBold,
  });

  // If the font fails to load, fall back to system fonts rather than blocking the app.
  if (!fontsLoaded && !fontError) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.bold },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, title: BRAND.nameAr }} />
        <Stack.Screen name="orders" options={{ title: ar.orders.title }} />
      </Stack>
    </>
  );
}
