import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true' || v === '1'));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgresql://stylo:stylo@localhost:5432/stylo_dev'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  /** TESTS ONLY: trust the `x-user-id` header (never in production). */
  AUTH_DEV_HEADER: bool,
  DEV_USER_ID: z.guid().optional(),
  /** Secret mixed into one-time-code hashes. Required in production. */
  OTP_PEPPER: z.string().min(16).optional(),
  /** Return the code in the API response (development only — there is no SMS here). */
  OTP_DEV_ECHO: bool,
  /**
   * How codes and order updates reach people:
   * 'whatsapp' (WhatsApp Business Cloud API — the main channel), 'sms_http' (optional fallback),
   * 'console' (development: nothing is sent, the code is shown on screen).
   */
  MESSAGING_PROVIDER: z.enum(['console', 'whatsapp', 'sms_http']).default('console'),
  WHATSAPP_TOKEN: z.string().min(20).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^\d{5,30}$/).optional(),
  WHATSAPP_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v21.0'),
  WHATSAPP_API_BASE: z.string().url().default('https://graph.facebook.com'),
  WHATSAPP_OTP_TEMPLATE: z.string().default('stylo_login_code'),
  WHATSAPP_ORDER_TEMPLATE: z.string().default('stylo_order_status'),
  WHATSAPP_TEMPLATE_LANG: z.string().default('ar'),
  /** Send order status updates to customers (WhatsApp/SMS). */
  NOTIFY_ORDER_STATUS: bool,
  SMS_HTTP_URL: z.string().url().optional(),
  SMS_HTTP_TOKEN: z.string().optional(),
  /** Folder with the built customer site (served at /) — see `npm run build:sites` at the repo root. */
  CUSTOMER_WEB_DIR: z.string().optional(),
  /** Folder with the built back office (served at /admin). */
  ADMIN_WEB_DIR: z.string().optional(),
  DEFAULT_CITY: z.string().default('طرابلس'),
  // Delivery rules (amounts in LYD dirhams: 1 د.ل = 1000)
  EXPRESS_SURCHARGE: z.coerce.number().int().nonnegative().default(5000),
  STANDARD_DELAY_HOURS: z.coerce.number().nonnegative().default(24),
  SAME_CITY_TRANSIT_HOURS: z.coerce.number().nonnegative().default(3),
  INTERCITY_TRANSIT_HOURS: z.coerce.number().nonnegative().default(24),
  SHARE_LINK_BASE: z.string().default('stylo://shared-cart/'),
});

export interface DeliveryConfig {
  /** Added to the store's fee for «أسرع توصيل» (dirhams). */
  expressSurcharge: number;
  /** Extra hours «توصيل عادي» waits for the courier's next regular round. */
  standardDelayHours: number;
  sameCityTransitHours: number;
  intercityTransitHours: number;
  /** Couriers deliver between these local (Libya, UTC+2) hours. */
  windowStartHour: number;
  windowEndHour: number;
}

export interface AuthConfig {
  /** Tests only: `x-user-id` header (and devUserId fallback) identify the user. */
  devHeader: boolean;
  devUserId?: string;
  otpPepper: string;
  /** Include the code in the request-code response (no SMS in development). */
  otpDevEcho: boolean;
  otpTtlSeconds: number;
  otpMaxAttempts: number;
  /** At most this many codes per phone per hour. */
  otpMaxPerHour: number;
  otpResendSeconds: number;
  customerSessionDays: number;
  adminSessionHours: number;
}

export interface MessagingConfig {
  provider: 'console' | 'whatsapp' | 'sms_http';
  whatsapp?: {
    token: string;
    phoneNumberId: string;
    apiVersion: string;
    apiBase: string;
    otpTemplate: string;
    orderTemplate: string;
    templateLang: string;
  };
  smsHttp?: { url: string; token?: string };
  notifyOrderStatus: boolean;
}

export interface Config {
  env: 'development' | 'test' | 'production';
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: string;
  auth: AuthConfig;
  messaging: MessagingConfig;
  web: { customerDir?: string; adminDir?: string };
  defaultCity: string;
  currency: 'LYD';
  delivery: DeliveryConfig;
  shareLinkBase: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Empty values in .env (e.g. `WHATSAPP_TOKEN=`) mean "not set".
  const e = EnvSchema.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  const production = e.NODE_ENV === 'production';

  if (production) {
    // Fail fast instead of running an insecure production server.
    if (!e.OTP_PEPPER) throw new Error('OTP_PEPPER is required in production');
    if (e.MESSAGING_PROVIDER === 'console') {
      throw new Error('Production needs a real channel: MESSAGING_PROVIDER=whatsapp (or sms_http)');
    }
  }
  if (e.MESSAGING_PROVIDER === 'whatsapp' && (!e.WHATSAPP_TOKEN || !e.WHATSAPP_PHONE_NUMBER_ID)) {
    throw new Error('MESSAGING_PROVIDER=whatsapp needs WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID');
  }
  if (e.MESSAGING_PROVIDER === 'sms_http' && !e.SMS_HTTP_URL) {
    throw new Error('MESSAGING_PROVIDER=sms_http needs SMS_HTTP_URL');
  }

  return {
    env: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    auth: {
      devHeader: !production && (e.AUTH_DEV_HEADER ?? false),
      devUserId: production ? undefined : e.DEV_USER_ID,
      otpPepper: e.OTP_PEPPER ?? 'stylo-dev-pepper-not-for-production',
      // Development: the code is also shown on screen (even when WhatsApp is configured).
      otpDevEcho: !production && (e.OTP_DEV_ECHO ?? true),
      otpTtlSeconds: 300,
      otpMaxAttempts: 5,
      otpMaxPerHour: 5,
      otpResendSeconds: 30,
      customerSessionDays: 60,
      adminSessionHours: 12,
    },
    messaging: {
      provider: e.MESSAGING_PROVIDER,
      whatsapp:
        e.WHATSAPP_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID
          ? {
              token: e.WHATSAPP_TOKEN,
              phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID,
              apiVersion: e.WHATSAPP_API_VERSION,
              apiBase: e.WHATSAPP_API_BASE.replace(/\/$/, ''),
              otpTemplate: e.WHATSAPP_OTP_TEMPLATE,
              orderTemplate: e.WHATSAPP_ORDER_TEMPLATE,
              templateLang: e.WHATSAPP_TEMPLATE_LANG,
            }
          : undefined,
      smsHttp: e.SMS_HTTP_URL ? { url: e.SMS_HTTP_URL, token: e.SMS_HTTP_TOKEN } : undefined,
      notifyOrderStatus: e.NOTIFY_ORDER_STATUS ?? e.NODE_ENV !== 'test',
    },
    web: { customerDir: e.CUSTOMER_WEB_DIR, adminDir: e.ADMIN_WEB_DIR },
    defaultCity: e.DEFAULT_CITY,
    currency: 'LYD',
    delivery: {
      expressSurcharge: e.EXPRESS_SURCHARGE,
      standardDelayHours: e.STANDARD_DELAY_HOURS,
      sameCityTransitHours: e.SAME_CITY_TRANSIT_HOURS,
      intercityTransitHours: e.INTERCITY_TRANSIT_HOURS,
      windowStartHour: 10,
      windowEndHour: 22,
    },
    shareLinkBase: e.SHARE_LINK_BASE,
  };
}
