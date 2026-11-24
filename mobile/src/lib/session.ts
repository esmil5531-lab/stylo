import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * The customer's session token (phone + code sign-in).
 * Native: expo-secure-store (Keychain / Keystore). Web: localStorage.
 * Kept in memory too, so the API client can read it synchronously.
 */
const KEY = 'stylo.session';
let token: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export async function loadSession(): Promise<void> {
  if (loaded) return;
  try {
    token =
      Platform.OS === 'web'
        ? (globalThis.localStorage?.getItem(KEY) ?? null)
        : await SecureStore.getItemAsync(KEY);
  } catch {
    token = null;
  }
  loaded = true;
  emit();
}

export function getToken(): string | null {
  return token;
}

export async function setSession(next: string | null): Promise<void> {
  token = next;
  try {
    if (Platform.OS === 'web') {
      if (next) globalThis.localStorage?.setItem(KEY, next);
      else globalThis.localStorage?.removeItem(KEY);
    } else if (next) {
      await SecureStore.setItemAsync(KEY, next);
    } else {
      await SecureStore.deleteItemAsync(KEY);
    }
  } catch {
    /* storage unavailable: the session lasts for this run only */
  }
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** { ready, signedIn } — re-renders on sign-in / sign-out / expiry. */
export function useSession() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => `${loaded}:${token ?? ''}`,
    () => 'false:',
  );
  const [ready, value] = [snapshot.startsWith('true'), snapshot.slice(snapshot.indexOf(':') + 1)];
  return { ready, signedIn: value.length > 0 };
}
