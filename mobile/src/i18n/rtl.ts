import { I18nManager, Platform } from 'react-native';

/**
 * Arabic is the primary language, so the whole app is laid out RTL.
 * Native: forced at launch by the expo-localization config plugin
 * (forcesRTL in app.json); these calls are a runtime safety net.
 * Web: <html dir="rtl"> is set in src/app/+html.tsx.
 */
export function ensureRTL() {
  if (Platform.OS === 'web') return;
  I18nManager.allowRTL(true);
  if (!I18nManager.isRTL) I18nManager.forceRTL(true);
}

/**
 * The app is RTL-only (see ensureRTL). On native the first launch may still
 * report LTR until the forced direction applies, so don't read I18nManager here.
 */
export const isRTL = true;

/** Icon names that point "back" / "forward" in reading direction. */
export const directionalIcons = {
  back: isRTL ? 'arrow-forward' : 'arrow-back',
  next: isRTL ? 'chevron-back' : 'chevron-forward',
  /** «تسوقي ←» call-to-action arrow (points the way the reader goes). */
  forward: isRTL ? 'arrow-back' : 'arrow-forward',
} as const;
