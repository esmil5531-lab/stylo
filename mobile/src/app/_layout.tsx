import { Cinzel_500Medium } from '@expo-google-fonts/cinzel';
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { PlayfairDisplay_400Regular } from '@expo-google-fonts/playfair-display';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ApiError } from '@/api/client';
import { ensureRTL } from '@/i18n/rtl';
import { loadOnboarding, useOnboardingSeen } from '@/lib/onboarding';
import { loadSession, useSession } from '@/lib/session';
import { colors } from '@/theme';

ensureRTL();

// Native apps have no window focus: refetch (driver orders, cart…) when the app comes back to the
// foreground, so a driver returning from the maps app never works from a stale list.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

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
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    Cinzel_500Medium,
    PlayfairDisplay_400Regular,
  });

  const session = useSession();
  const onboarded = useOnboardingSeen();
  useEffect(() => {
    void loadSession();
    void loadOnboarding();
  }, []);

  // Sign-in / sign-out: drop the previous person's cart, ♡, orders and product hearts. Done during
  // render, before the screens subscribe — clearing in an effect would cancel their first requests.
  const [previous, setPrevious] = useState(session.signedIn);
  if (previous !== session.signedIn) {
    setPrevious(session.signedIn);
    queryClient.clear();
  }

  const { width } = useWindowDimensions();
  // On a computer the site keeps the phone layout, centred on the brand's sand tone.
  const framed = Platform.OS === 'web' && width > 640;

  // If fonts fail to load, fall back to system fonts rather than blocking the app.
  if ((!fontsLoaded && !fontError) || !session.ready || onboarded === null) return null;

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
  page: { flex: 1, backgroundColor: colors.surfaceMuted, alignItems: 'center' },
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
