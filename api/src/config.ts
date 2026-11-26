import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { DatabaseConfig } from './lib/database.js';
import type { SeoConfig } from './seo.js';

/** api/src/config.ts and api/dist/config.js are both two levels below the repo root. */
const REPO_DIR = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true' || v === '1'));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgresql://stylo:stylo@localhost:5432/stylo_dev'),
  /** disable | require | verify — see lib/database.ts (unset = automatic per host). */
  DATABASE_SSL: z.enum(['disable', 'require', 'verify']).optional(),
  /** CA certificate file for DATABASE_SSL=verify (e.g. Supabase's prod-ca-2021.crt). */
  DATABASE_CA_FILE: z.string().optional(),
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
  /** Public address of the site, e.g. https://stylo.ly (canonical links, sitemap, previews). */
  PUBLIC_SITE_URL: z.string().url().optional(),
  /** Let Google index the customer site. Default: on in production only (never index staging). */
  SEO_INDEXING: bool,
  /** Content of the google-site-verification meta tag (Google Search Console → HTML tag). */
  GOOGLE_SITE_VERIFICATION: z.string().regex(/^[A-Za-z0-9_-]{10,100}$/).optional(),
  /** Behind a reverse proxy (Caddy/Nginx): trust X-Forwarded-* for protocol and client IP. */
  TRUST_PROXY: bool,
  /** Extra origins allowed to call the API from a browser (comma-separated). Same-origin needs none. */
  CORS_ORIGINS: z.string().optional(),
  /** Where uploaded photos go: 'local' (UPLOADS_DIR, served at /uploads/) or 'supabase' (Storage). */
  MEDIA_STORAGE: z.enum(['local', 'supabase']).default('local'),
  UPLOADS_DIR: z.string().optional(),
  /** Max size of one uploaded photo in MB (before compression). */
  MEDIA_MAX_MB: z.coerce.number().positive().max(50).default(10),
  OTP_MAX_PER_IP_HOUR: z.coerce.number().int().positive().default(30),
  /** A pending order older than this (minutes) is flagged in the back office (late, unconfirmed). */
  PENDING_ALERT_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(15),
  /** Cancel pending orders the store has not confirmed after this many minutes. 0 = never (default). */
  PENDING_AUTO_CANCEL_MINUTES: z.coerce.number().int().min(0).max(7 * 24 * 60).default(0),
  /** Extra request limits (see LimitsConfig). Default: on, except in tests. */
  RATE_LIMITS: bool,
  /** Requests per IP address per minute on /v1 (carrier NAT: many customers share one IP). */
  API_MAX_PER_IP_MINUTE: z.coerce.number().int().positive().default(1200),
  SUPABASE_URL: z.string().url().optional(),
  /** Supabase "service_role" key — server only, never in the app or the admin site. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().regex(/^[a-z0-9-]{3,63}$/).default('media'),
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
  /** At most this many code requests per IP address per hour (carrier NAT: keep it generous). */
  otpMaxPerIpHour: number;
  otpResendSeconds: number;
  /** Customer/guest access token lifetime; the app renews it silently with the refresh token. */
  customerAccessHours: number;
  /** Refresh token lifetime, renewed on every use: the code is asked once per device. */
  customerRefreshDays: number;
  /** Back-office sessions: no refresh, sign in again after this. */
  adminSessionHours: number;
  /** Guests (cart without an account) idle longer than this are deleted. */
  guestRetentionDays: number;
  /** Guest sessions created per IP address per hour. */
  guestMaxPerIpHour: number;
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

export interface MediaConfig {
  driver: 'local' | 'supabase';
  /** Folder for 'local' (always set: tests use a temp folder). */
  localDir: string;
  maxBytes: number;
  supabase?: { url: string; serviceKey: string; bucket: string };
}

export interface Config {
  env: 'development' | 'test' | 'production';
  databaseUrl: string;
  database: DatabaseConfig;
  port: number;
  host: string;
  logLevel: string;
  auth: AuthConfig;
  messaging: MessagingConfig;
  web: { customerDir?: string; adminDir?: string };
  media: MediaConfig;
  limits: LimitsConfig;
  orderAlerts: OrderAlertsConfig;
  seo: SeoConfig;
  trustProxy: boolean;
  /** true = reflect any origin (development); otherwise the listed origins only. */
  corsOrigins: true | string[];
  defaultCity: string;
  currency: 'LYD';
  delivery: DeliveryConfig;
  shareLinkBase: string;
}

/**
 * In-memory request limits (one server process). The sign-in code limits live in AuthConfig and
 * are always on; these protect the rest: brute force, spam orders, upload floods, scraping.
 */
export interface LimitsConfig {
  enabled: boolean;
  apiPerIpMinute: number;
  /** Code checks per IP per hour (guessing codes across many numbers). */
  otpVerifyPerIpHour: number;
  refreshPerIpHour: number;
  checkoutPerUserHour: number;
  sharePerUserHour: number;
  reviewsPerUserHour: number;
  uploadsPerUserHour: number;
}

/** «تنبيهات الطلبات»: when an unconfirmed order counts as late, and the optional auto-cancel. */
export interface OrderAlertsConfig {
  pendingAlertMinutes: number;
  /** 0 = off. Otherwise pending orders older than this are cancelled (restocked, customer told). */
  autoCancelPendingMinutes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Empty values in .env (e.g. `WHATSAPP_TOKEN=`) mean "not set".
  const e = EnvSchema.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  const production = e.NODE_ENV === 'production';

  if (production) {
    // Fail fast instead of running an insecure production server.
    if (!e.OTP_PEPPER) throw new Error('OTP_PEPPER is required in production');
    if (!e.PUBLIC_SITE_URL?.startsWith('https://')) {
      throw new Error('PUBLIC_SITE_URL must be the https:// address of the site in production');
    }
    if (e.MESSAGING_PROVIDER === 'console') {
      throw new Error('Production needs a real channel: MESSAGING_PROVIDER=whatsapp (or sms_http)');
    }
  }
  if (e.MESSAGING_PROVIDER === 'whatsapp' && (!e.WHATSAPP_TOKEN || !e.WHATSAPP_PHONE_NUMBER_ID)) {
    throw new Error('MESSAGING_PROVIDER=whatsapp needs WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID');
  }
  if (e.MEDIA_STORAGE === 'supabase' && (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('MEDIA_STORAGE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  if (e.MESSAGING_PROVIDER === 'sms_http' && !e.SMS_HTTP_URL) {
    throw new Error('MESSAGING_PROVIDER=sms_http needs SMS_HTTP_URL');
  }

  return {
    env: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    database: { url: e.DATABASE_URL, ssl: e.DATABASE_SSL, caFile: e.DATABASE_CA_FILE },
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
      otpMaxPerIpHour: e.OTP_MAX_PER_IP_HOUR,
      otpResendSeconds: 30,
      customerAccessHours: 24,
      customerRefreshDays: 180,
      adminSessionHours: 12,
      guestRetentionDays: 30,
      guestMaxPerIpHour: 60,
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
    // Defaults (outside tests): the build folders in this repo, wherever the server is started from —
    // so an older api/.env without these lines still serves both sites after `npm run build`.
    web: {
      customerDir: e.CUSTOMER_WEB_DIR ?? (e.NODE_ENV === 'test' ? undefined : REPO_DIR('mobile/dist')),
      adminDir: e.ADMIN_WEB_DIR ?? (e.NODE_ENV === 'test' ? undefined : REPO_DIR('admin/dist')),
    },
    media: {
      driver: e.MEDIA_STORAGE,
      localDir: e.UPLOADS_DIR ?? REPO_DIR('uploads'),
      maxBytes: Math.round(e.MEDIA_MAX_MB * 1_048_576),
      supabase:
        e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY
          ? { url: e.SUPABASE_URL.replace(/\/$/, ''), serviceKey: e.SUPABASE_SERVICE_ROLE_KEY, bucket: e.SUPABASE_STORAGE_BUCKET }
          : undefined,
    },
    orderAlerts: {
      pendingAlertMinutes: e.PENDING_ALERT_MINUTES,
      autoCancelPendingMinutes: e.PENDING_AUTO_CANCEL_MINUTES,
    },
    limits: {
      enabled: e.RATE_LIMITS ?? e.NODE_ENV !== 'test',
      apiPerIpMinute: e.API_MAX_PER_IP_MINUTE,
      otpVerifyPerIpHour: 60,
      refreshPerIpHour: 600,
      checkoutPerUserHour: 20,
      sharePerUserHour: 30,
      reviewsPerUserHour: 30,
      uploadsPerUserHour: 300,
    },
    seo: {
      siteUrl: e.PUBLIC_SITE_URL?.replace(/\/$/, ''),
      indexing: e.SEO_INDEXING ?? production,
      googleSiteVerification: e.GOOGLE_SITE_VERIFICATION,
    },
    trustProxy: e.TRUST_PROXY ?? production,
    corsOrigins: e.CORS_ORIGINS
      ? e.CORS_ORIGINS.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)
      : production
        ? []
        : true,
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
