import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgresql://stylo:stylo@localhost:5432/stylo_dev'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  DEV_USER_ID: z.guid().optional(),
  DEFAULT_CITY: z.string().default('طرابلس'),
  // Delivery rules (amounts in LYD dirhams: 1 د.ل = 1000)
  UNIFIED_DELIVERY_FEE: z.coerce.number().int().nonnegative().default(15000),
  CONSOLIDATION_HOURS: z.coerce.number().nonnegative().default(6),
  SAME_CITY_TRANSIT_HOURS: z.coerce.number().nonnegative().default(3),
  INTERCITY_TRANSIT_HOURS: z.coerce.number().nonnegative().default(24),
  SHARE_LINK_BASE: z.string().default('stylo://shared-cart/'),
});

export interface DeliveryConfig {
  unifiedFee: number;
  consolidationHours: number;
  sameCityTransitHours: number;
  intercityTransitHours: number;
  /** Couriers deliver between these local (Libya, UTC+2) hours. */
  windowStartHour: number;
  windowEndHour: number;
}

export interface Config {
  env: 'development' | 'test' | 'production';
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: string;
  /** Only honoured outside production. Lets the app run before real auth exists. */
  devUserId?: string;
  defaultCity: string;
  currency: 'LYD';
  delivery: DeliveryConfig;
  shareLinkBase: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = EnvSchema.parse(env);
  return {
    env: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    devUserId: e.NODE_ENV === 'production' ? undefined : e.DEV_USER_ID,
    defaultCity: e.DEFAULT_CITY,
    currency: 'LYD',
    delivery: {
      unifiedFee: e.UNIFIED_DELIVERY_FEE,
      consolidationHours: e.CONSOLIDATION_HOURS,
      sameCityTransitHours: e.SAME_CITY_TRANSIT_HOURS,
      intercityTransitHours: e.INTERCITY_TRANSIT_HOURS,
      windowStartHour: 10,
      windowEndHour: 22,
    },
    shareLinkBase: e.SHARE_LINK_BASE,
  };
}
