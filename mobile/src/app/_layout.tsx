import { Cinzel_600SemiBold } from '@expo-google-fonts/cinzel';
import {
  Cairo_400Regular,
  Cairo_600SemiBold,
  Cairo_700Bold,
  Cairo_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/cairo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ApiError } from '@/api/client';
import { ensureRTL } from '@/i18n/rtl';
import { loadSession, useSession } from '@/lib/session';
import { colors } from '@/theme';

ensureRTL();

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Don't retry client errors (404, 401…); retry network/server errors twice.
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
    Cairo_800ExtraBold,
    Cinzel_600SemiBold,
  });

  const session = useSession();
  useEffect(() => {
    void loadSession();
  }, []);

  // Sign-in / sign-out: drop the previous person's cart, ♡, orders and product hearts. Done during
  // render, before the screens subscribe — clearing in an effect would cancel their first requests.
  const [previous, setPrevious] = useState(session.signedIn);
  if (previous !== session.signedIn) {
    setPrevious(session.signedIn);
    queryClient.clear();
  }

  const { width } = useWindowDimensions();
  // On a computer the site keeps the approved phone layout, centred on the brand's soft pink.
  const framed = Platform.OS === 'web' && width > 640;

  // If fonts fail to load, fall back to system fonts rather than blocking the app.
  if ((!fontsLoaded && !fontError) || !session.ready) return null;

  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
  );
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      {framed ? (
        <View style={styles.page}>
          <View style={styles.frame}>{stack}</View>
        </View>
      ) : (
        stack
      )}
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.heroBackground, alignItems: 'center' },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: 460,
    backgroundColor: colors.background,
    borderStartWidth: 1,
    borderEndWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
  },
});
