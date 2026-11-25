import Constants from 'expo-constants';

import { whatsappNumber } from './format';

/**
 * «تواصل معنا»: Stylo's customer-service WhatsApp number, from EXPO_PUBLIC_SUPPORT_WHATSAPP
 * (mobile/.env, e.g. 0912345678). Not set → the row is hidden.
 */
export function supportWhatsAppUrl(): string | null {
  const n = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP?.trim();
  return n ? `https://wa.me/${whatsappNumber(n)}` : null;
}

export const appVersion: string = Constants.expoConfig?.version ?? '';
