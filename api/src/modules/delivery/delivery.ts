import type { DeliveryConfig } from '../../config.js';

/**
 * Delivery rules — pure functions, no I/O, so they are easy to test and change.
 *
 * "أسرع توصيل" (fastest): each store ships its own parcel as soon as it is ready.
 *    fee  = sum of each store's delivery_fee
 *    ETA  = per store: now + prep_hours + transit (arrivals may differ per store)
 * "توصيل موحد" (unified): Stylo collects every store's items and sends one parcel.
 *    fee  = one flat platform fee
 *    ETA  = now + slowest prep + consolidation + slowest transit
 * Unified is only offered when the cart has items from 2+ stores.
 */

export type DeliveryMode = 'fastest' | 'unified';

/** Libya is UTC+2 all year (no DST). */
const LIBYA_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export interface StoreShipmentInput {
  storeId: string;
  city: string;
  prepHours: number;
  deliveryFee: number;
}

export interface StoreEta {
  storeId: string;
  fee: number;
  arrivesAt: string;
  /** 0 = today, 1 = tomorrow, … (Libya local calendar days) */
  dayOffset: number;
}

export interface DeliveryOption {
  mode: DeliveryMode;
  available: boolean;
  fee: number;
  shipments: number;
  arrivesAt: string | null;
  dayOffset: number | null;
  perStore: StoreEta[];
}

export interface DeliveryQuote {
  fastest: DeliveryOption;
  unified: DeliveryOption & { savings: number };
}

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

export function estimateArrival(
  now: Date,
  prepHours: number,
  storeCity: string,
  customerCity: string,
  cfg: DeliveryConfig,
): Date {
  const raw = new Date(now.getTime() + (prepHours + transitHours(storeCity, customerCity, cfg)) * HOUR_MS);
  return fitToDeliveryWindow(raw, cfg);
}

export function quoteDelivery(
  stores: StoreShipmentInput[],
  customerCity: string,
  now: Date,
  cfg: DeliveryConfig,
): DeliveryQuote {
  const perStore: StoreEta[] = stores.map((s) => {
    const at = estimateArrival(now, s.prepHours, s.city, customerCity, cfg);
    return { storeId: s.storeId, fee: s.deliveryFee, arrivesAt: at.toISOString(), dayOffset: dayOffset(now, at) };
  });

  const latest = perStore.reduce<StoreEta | null>(
    (acc, s) => (!acc || s.arrivesAt > acc.arrivesAt ? s : acc),
    null,
  );
  const fastestFee = perStore.reduce((sum, s) => sum + s.fee, 0);

  const fastest: DeliveryOption = {
    mode: 'fastest',
    available: stores.length > 0,
    fee: fastestFee,
    shipments: stores.length,
    arrivesAt: latest?.arrivesAt ?? null,
    dayOffset: latest?.dayOffset ?? null,
    perStore,
  };

  let unifiedAt: Date | null = null;
  if (stores.length > 0) {
    const maxPrep = Math.max(...stores.map((s) => s.prepHours));
    const maxTransit = Math.max(...stores.map((s) => transitHours(s.city, customerCity, cfg)));
    unifiedAt = fitToDeliveryWindow(
      new Date(now.getTime() + (maxPrep + cfg.consolidationHours + maxTransit) * HOUR_MS),
      cfg,
    );
  }
  const unifiedAvailable = stores.length > 1;
  const unifiedFee = stores.length > 0 ? cfg.unifiedFee : 0;

  return {
    fastest,
    unified: {
      mode: 'unified',
      available: unifiedAvailable,
      fee: unifiedFee,
      shipments: stores.length > 0 ? 1 : 0,
      arrivesAt: unifiedAt?.toISOString() ?? null,
      dayOffset: unifiedAt ? dayOffset(now, unifiedAt) : null,
      perStore: [],
      savings: unifiedAvailable ? Math.max(0, fastestFee - unifiedFee) : 0,
    },
  };
}

/** Splits a total fee across N orders; the remainder goes to the first so the sum is exact. */
export function splitFee(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const out = Array.from({ length: parts }, () => base);
  out[0]! += total - base * parts;
  return out;
}
