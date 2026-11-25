import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * «التعريف» (onboarding) is shown once, on the app's first launch — not on the website (visitors
 * and search engines land straight on the shop; /onboarding stays reachable there).
 */
const KEY = 'stylo.onboarded';
let seen: boolean | null = null;
const listeners = new Set<() => void>();

export async function loadOnboarding(): Promise<void> {
  if (seen !== null) return;
  if (Platform.OS === 'web') {
    seen = true;
  } else {
    try {
      seen = (await SecureStore.getItemAsync(KEY)) === '1';
    } catch {
      seen = true; // storage unavailable: never block the shop
    }
  }
  listeners.forEach((l) => l());
}

export async function finishOnboarding(): Promise<void> {
  seen = true;
  listeners.forEach((l) => l());
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(KEY, '1').catch(() => undefined);
}

/** null while loading; true once seen (or on the web). */
export function useOnboardingSeen(): boolean | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => seen,
    () => true,
  );
}
