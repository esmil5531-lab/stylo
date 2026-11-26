import type { Queryable } from '../db.js';
import type { Ctx } from './context.js';

/**
 * Delivery coverage («مناطق التوصيل», migration 0015). Launch: Tripoli only.
 * - Customers only see stores whose city is served (`storeServed`).
 * - An order needs the address in a served city and in the store's own city: there is no
 *   intercity delivery until it has its own fees.
 * The served cities live in the `service_cities` table: opening a city is one INSERT.
 */

/** SQL condition: the store's city is served (use with the stores alias of the query). */
export const storeServed = (alias = 's') => `${alias}.city IN (SELECT city FROM service_cities)`;

export async function getServiceCities(db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ city: string }>(`SELECT city FROM service_cities ORDER BY created_at, city`);
  return rows.map((r) => r.city);
}

export interface DeliveryArea {
  /** The customer's city: default address, else the default city (guests, no address yet). */
  city: string;
  served: boolean;
  servedCities: string[];
}

export function deliveryArea(city: string, servedCities: string[]): DeliveryArea {
  return { city, served: servedCities.includes(city), servedCities };
}

/** One query: the customer's city and the served cities. */
export async function getDeliveryArea(ctx: Ctx): Promise<DeliveryArea> {
  const { rows } = await ctx.db.query<{ city: string | null; served: string[] | null }>(
    `SELECT (SELECT city FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, updated_at DESC LIMIT 1) AS city,
            (SELECT array_agg(city ORDER BY created_at, city) FROM service_cities) AS served`,
    [ctx.userId],
  );
  return deliveryArea(rows[0]?.city ?? ctx.config.defaultCity, rows[0]?.served ?? []);
}

/** «طرابلس» · «طرابلس وبنغازي» · «طرابلس، بنغازي ومصراتة». */
export function citiesText(cities: string[]): string {
  if (cities.length <= 1) return cities[0] ?? '';
  return `${cities.slice(0, -1).join('، ')} و${cities.at(-1)}`;
}

export type CoverageCode = 'outside_coverage' | 'store_other_city';
export interface CoverageIssue {
  code: CoverageCode;
  message: string;
  servedCities: string[];
}

/** Why this store cannot deliver to this customer, or null when it can. */
export function coverageIssue(area: DeliveryArea, store: { city: string; name: string }): CoverageIssue | null {
  if (!area.served) {
    return {
      code: 'outside_coverage',
      message:
        area.servedCities.length === 0
          ? 'التوصيل متوقف مؤقتاً، نعود قريباً'
          : `التوصيل متاح حالياً داخل ${citiesText(area.servedCities)} فقط، وعنوانك في ${area.city}. نعمل على الوصول إلى مدن أخرى قريباً`,
      servedCities: area.servedCities,
    };
  }
  if (store.city !== area.city) {
    return {
      code: 'store_other_city',
      message: `«${store.name}» يوصّل داخل ${store.city} فقط حالياً، وعنوانك في ${area.city}`,
      servedCities: area.servedCities,
    };
  }
  return null;
}

/** Text for screens that explain the coverage before any order (product page, address form). */
export function coverageNote(area: DeliveryArea): string | null {
  return area.served ? null : coverageIssue(area, { city: area.city, name: '' })!.message;
}
