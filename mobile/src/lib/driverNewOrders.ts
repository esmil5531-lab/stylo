import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';

/**
 * «طلب جديد مُسند إليك» in driver mode: the orders the driver has already seen are kept on the
 * device; an active order that is not among them is new → the phone vibrates and the screen shows
 * a banner + a «جديد» tag until he taps «حسناً». The first time on a device, the orders already
 * assigned count as seen (nothing to ring for). Works while the app is open (the list refreshes
 * every 20 s); with the app closed, push notifications are needed (store builds).
 */
const KEY = 'stylo.driverSeenOrders';
const MAX_IDS = 200;
const VIBRATION = [0, 400, 200, 400];

async function readIds(): Promise<string[] | null> {
  try {
    const raw = Platform.OS === 'web' ? (globalThis.localStorage?.getItem(KEY) ?? null) : await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

async function writeIds(ids: string[]): Promise<void> {
  const value = JSON.stringify(ids.slice(-MAX_IDS));
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, value);
    else await SecureStore.setItemAsync(KEY, value);
  } catch {
    /* storage unavailable: the banner shows again after a restart */
  }
}

export function useNewAssignments(activeIds: string[] | undefined) {
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const loading = useRef(false);
  const rungFor = useRef(new Set<string>());

  useEffect(() => {
    if (!activeIds || seen || loading.current) return;
    loading.current = true;
    void readIds().then((stored) => {
      if (stored === null) {
        // First use on this device: what is already assigned is not «new».
        void writeIds(activeIds);
        setSeen(new Set(activeIds));
      } else {
        setSeen(new Set(stored));
      }
    });
  }, [activeIds, seen]);

  const newIds = seen && activeIds ? activeIds.filter((id) => !seen.has(id)) : [];
  const key = newIds.join(',');

  useEffect(() => {
    if (!key) return;
    const unrung = key.split(',').filter((id) => !rungFor.current.has(id));
    if (unrung.length === 0) return;
    unrung.forEach((id) => rungFor.current.add(id));
    try {
      Vibration.vibrate(VIBRATION);
    } catch {
      /* no vibration on this device */
    }
  }, [key]);

  const dismiss = () => {
    if (!seen || newIds.length === 0) return;
    const next = new Set([...seen, ...newIds]);
    setSeen(next);
    void writeIds([...next]);
  };

  return { newIds, dismiss };
}
