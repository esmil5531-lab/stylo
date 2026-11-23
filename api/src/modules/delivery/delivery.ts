import type { DeliveryConfig } from '../../config.js';

/**
 * Delivery rules — pure functions, no I/O, so they are easy to test and change.
 * Every cart/order belongs to ONE store, so there is exactly one parcel.
 *
 * "أسرع توصيل" (fastest): priority courier picks up as soon as the store is ready.
 *    fee = store.delivery_fee + expressSurcharge
 *    ETA = now + prep_hours + transit
 * "توصيل عادي" (standard): the parcel joins the courier's next regular round.
 *    fee = store.delivery_fee
 *    ETA = now + prep_hours + transit + standardDelayHours
 * Arrivals outside courier hours move to the next delivery window.
 */

export const DELIVERY_MODES = ['fastest', 'standard'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/** Libya is UTC+2 all year (no DST). */
const LIBYA_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export interface StoreShipmentInput {
  city: string;
  prepHours: number;
  deliveryFee: number;
}

export interface DeliveryOption {
  mode: DeliveryMode;
  fee: number;
  arrivesAt: string;
  /** 0 = today, 1 = tomorrow, … (Libya local calendar days) */
  dayOffset: number;
}

export type DeliveryQuote = Record<DeliveryMode, DeliveryOption>;

export function transitHours(storeCity: string, customerCity: string, cfg: DeliveryConfig): number {
  return storeCity === customerCity ? cfg.sameCityTransitHours : cfg.intercityTransitHours;
}

function toLocal(d: Date): Date {
  return new Date(d.getTime() + LIBYA_UTC_OFFSET_MS);
}

/** Moves an arrival time that falls outside courier hours to the next delivery window. */
export function fitToDeliveryWindow(at: Date, cfg: DeliveryConfig): Date {
  const local = toLocal(at);
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  if (hour >= cfg.windowStartHour && hour < cfg.windowEndHour) return at;
  const next = new Date(local);
  if (hour >= cfg.windowEndHour) next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(cfg.windowStartHour, 0, 0, 0);
  return new Date(next.getTime() - LIBYA_UTC_OFFSET_MS);
}

/** Calendar-day difference between two instants, in Libya local time. */
export function dayOffset(from: Date, to: Date): number {
  const a = toLocal(from);
  const b = toLocal(to);
  const da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const db = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((db - da) / (24 * HOUR_MS));
}

function arrival(now: Date, hours: number, cfg: DeliveryConfig): Date {
  return fitToDeliveryWindow(new Date(now.getTime() + hours * HOUR_MS), cfg);
}

/** Fastest possible arrival — what product cards show as «يصلك اليوم / غداً». */
export function estimateArrival(
  now: Date,
  prepHours: number,
  storeCity: string,
  customerCity: string,
  cfg: DeliveryConfig,
): Date {
  return arrival(now, prepHours + transitHours(storeCity, customerCity, cfg), cfg);
}

export function quoteDelivery(
  store: StoreShipmentInput,
  customerCity: string,
  now: Date,
  cfg: DeliveryConfig,
): DeliveryQuote {
  const base = store.prepHours + transitHours(store.city, customerCity, cfg);
  const fastestAt = arrival(now, base, cfg);
  const standardAt = arrival(now, base + cfg.standardDelayHours, cfg);
  return {
    fastest: {
      mode: 'fastest',
      fee: store.deliveryFee + cfg.expressSurcharge,
      arrivesAt: fastestAt.toISOString(),
      dayOffset: dayOffset(now, fastestAt),
    },
    standard: {
      mode: 'standard',
      fee: store.deliveryFee,
      arrivesAt: standardAt.toISOString(),
      dayOffset: dayOffset(now, standardAt),
    },
  };
}
