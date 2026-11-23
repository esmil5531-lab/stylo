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
