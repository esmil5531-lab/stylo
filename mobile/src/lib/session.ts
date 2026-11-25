import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * The session, kept on the device (native: expo-secure-store = Keychain / Keystore; web:
 * localStorage) and in memory so the API client can read it synchronously.
 *
 *  - Customers: a short access token (24 h) + a long refresh token (180 days, renewed on every use):
 *    the WhatsApp code is asked once per device; the client renews the pair silently.
 *  - Guests: the same kind of session without a phone (`guest: true`), created on the first
 *    add-to-cart / ♡. Signing in merges the guest's cart into the account (server side).
 */
export interface StoredSession {
  token: string;
  refreshToken?: string;
  /** Access token expiry (ISO). */
  expiresAt?: string;
  guest: boolean;
}

const KEY = 'stylo.session';
let session: StoredSession | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function parse(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as StoredSession;
    if (v && typeof v.token === 'string') return { ...v, guest: v.guest === true };
  } catch {
    // Before Phase B the value was the bare token of a signed-in customer.
    return { token: raw, guest: false };
  }
  return null;
}

export async function loadSession(): Promise<void> {
  if (loaded) return;
  try {
    session = parse(
      Platform.OS === 'web' ? (globalThis.localStorage?.getItem(KEY) ?? null) : await SecureStore.getItemAsync(KEY),
    );
  } catch {
    session = null;
  }
  loaded = true;
  emit();
}

export function getSession(): StoredSession | null {
  return session;
}

export function getToken(): string | null {
  return session?.token ?? null;
}

export async function setSession(next: StoredSession | null): Promise<void> {
  session = next;
  const raw = next ? JSON.stringify(next) : null;
  try {
    if (Platform.OS === 'web') {
      if (raw) globalThis.localStorage?.setItem(KEY, raw);
      else globalThis.localStorage?.removeItem(KEY);
    } else if (raw) {
      await SecureStore.setItemAsync(KEY, raw);
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

/**
 * `signedIn`: a verified customer (phone) — orders, addresses, account, checkout.
 * `hasSession`: signed in **or** guest — cart and ♡ work.
 */
export function useSession() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => `${loaded ? 1 : 0}${session ? (session.guest ? 'g' : 'c') : '-'}`,
    () => '0-',
  );
  return { ready: snapshot[0] === '1', signedIn: snapshot[1] === 'c', hasSession: snapshot[1] !== '-' };
}
