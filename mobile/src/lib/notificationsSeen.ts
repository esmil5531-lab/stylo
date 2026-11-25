import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * When the customer last opened «الإشعارات» (ISO time), kept on the device: the bell shows how
 * many order updates are newer. Not secret, but SecureStore is the storage the app already ships.
 */
const KEY = 'stylo.notificationsSeenAt';
let seenAt: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    seenAt =
      Platform.OS === 'web' ? (globalThis.localStorage?.getItem(KEY) ?? null) : await SecureStore.getItemAsync(KEY);
  } catch {
    seenAt = null;
  }
  emit();
}

export async function markNotificationsSeen(at: string): Promise<void> {
  if (seenAt && seenAt >= at) return;
  seenAt = at;
  emit();
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, at);
    else await SecureStore.setItemAsync(KEY, at);
  } catch {
    /* storage unavailable: counts reset next launch */
  }
}

/** Last-seen time, or null when never opened (then every update counts as new). */
export function useNotificationsSeenAt(): string | null {
  void load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => seenAt,
    () => seenAt,
  );
}

/** Never opened on this device: only the last 48 hours count as new (not a «9+» of old orders). */
export function isUnread(at: string, seenAt: string | null, now = Date.now()): boolean {
  return at > (seenAt ?? new Date(now - 48 * 3_600_000).toISOString());
}
