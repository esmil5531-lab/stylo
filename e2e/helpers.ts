import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

export { expect };

/**
 * E2E_SLOW_MS=800 delays every /v1 request of the browser by that much, to run the journeys as on
 * a slow machine or network: a test that leaves a page before its request finished (the browser
 * cancels it) fails here instead of only on someone else's computer.
 */
const SLOW_MS = Number(process.env.E2E_SLOW_MS ?? 0);
export async function slowDown(context: BrowserContext): Promise<void> {
  if (!(SLOW_MS > 0)) return;
  await context.route(/\/v1\//, async (route) => {
    await new Promise((r) => setTimeout(r, SLOW_MS));
    await route.continue().catch(() => {}); // the page may have navigated away meanwhile
  });
}

/** `test` with the optional slow-down applied to every journey's browser context. */
export const test = base.extend<{ slowApi: void }>({
  slowApi: [
    async ({ context }, use) => {
      await slowDown(context);
      await use();
    },
    { auto: true },
  ],
});

/** Seeded accounts (database/seeds/dev_seed.sql). */
export const PHONES = {
  sara: '+218910000004', // customer, Tripoli address
  superAdmin: '+218910000001',
  lauraOwner: '+218910000002', // «أزياء لورا» store owner
  operations: '+218910000006', // operations manager (custody, dispatch)
  // سالم القماطي — available driver in Tripoli (the panel only offers AVAILABLE drivers; محمد is
  // busy with a seeded delivery).
  driver: '+218910000013',
} as const;
export const DRIVER_NAME = 'سالم القماطي';

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4000';

/** «0912345678» as typed in Libya from «+218912345678». */
export const localPhone = (e164: string) => `0${e164.slice(4)}`;

export async function api<T = any>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${BASE}/v1${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return json as T;
}

/** Sign-in through the API (development servers echo the code as `devCode`). */
export async function apiLogin(phone: string, app: 'customer' | 'admin' = 'customer') {
  const sent = await api<{ devCode?: string }>('POST', '/auth/otp/request', { phone, app }).catch((err: Error) => {
    if (/otp_ip_limit/.test(err.message)) {
      throw new Error('the server refused more sign-in codes from this address: start it with OTP_MAX_PER_IP_HOUR=1000 for test runs');
    }
    throw err;
  });
  if (!sent.devCode) throw new Error('the server does not echo codes: run the journeys against a development server');
  return api<{ token: string; refreshToken: string; expiresAt: string }>('POST', '/auth/otp/verify', {
    phone,
    code: sent.devCode,
    app,
  });
}

/** Reads «… الرمز: 123456» shown on screen in development. */
export async function codeOnScreen(page: Page): Promise<string> {
  const text = page.getByText(/الرمز:\s*\d{6}/).first();
  await expect(text).toBeVisible();
  const m = /(\d{6})/.exec((await text.textContent()) ?? '');
  if (!m) throw new Error('no development code on screen');
  return m[1]!;
}

/** Back office sign-in through its own login page. */
export async function adminLogin(page: Page, phone: string) {
  await page.goto('/admin/');
  await page.getByLabel('رقم الهاتف').fill(localPhone(phone));
  await page.getByRole('button', { name: 'إرسال رمز الدخول' }).click();
  const code = await codeOnScreen(page);
  await page.locator('input.otp-input').fill(code);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await expect(page.getByRole('button', { name: 'تسجيل الخروج' })).toBeVisible();
}

/** A fresh Libyan mobile number for a new customer (different every run). */
export function newCustomerPhone(): string {
  const n = String(Date.now() % 10_000_000).padStart(7, '0');
  return `+21894${n}`;
}

/** A product of «أزياء لورا» (Tripoli) with stock and a single variant: one tap adds it. */
export async function simpleLauraProduct(): Promise<{ id: string; name: string; price: number }> {
  const list = await api<{ items: { id: string; name: string; price: number; inStock: boolean; store: { slug: string } }[] }>(
    'GET',
    '/products?limit=50&sort=price_asc',
  );
  for (const p of list.items.filter((x) => x.store.slug === 'laura' && x.inStock)) {
    const d = await api<{ variants: { stock: number }[] }>('GET', `/products/${p.id}`);
    if (d.variants.length === 1 && d.variants[0]!.stock > 2) return p;
  }
  throw new Error('no single-variant Laura product in stock (run npm run db:reset)');
}

/** Places an order as Sara through the API (setup for the store / driver / staff journeys). */
export async function placeOrderAsSara(token: string): Promise<{ id: string; orderNumber: number; total: number }> {
  const p = await simpleLauraProduct();
  const d = await api<{ variants: { id: string }[] }>('GET', `/products/${p.id}`);
  await api('DELETE', '/cart', undefined, token);
  await api('POST', '/cart/items', { variantId: d.variants[0]!.id, quantity: 1, replaceCart: true }, token);
  return api('POST', '/checkout', { deliveryMode: 'standard' }, token);
}

/**
 * Runs `action` (a click…) and waits until the server answered the matching /v1 request, so the
 * journey never leaves the page while it is in flight (a full navigation cancels it, which on a
 * slow machine silently loses the change). Fails if the server refused it.
 */
export async function untilSaved(page: Page, method: string, path: RegExp, action: () => Promise<unknown>) {
  const response = page.waitForResponse(
    (r) => r.request().method() === method && path.test(new URL(r.url()).pathname),
    { timeout: 30_000 },
  );
  await action();
  const res = await response;
  if (!res.ok()) throw new Error(`${method} ${new URL(res.url()).pathname} → ${res.status()} ${await res.text()}`);
  return res;
}

/**
 * Where the shared order stands, from the server — not from text on screen (the order timeline
 * always shows every status name). `previous` names the journey that should have got it there.
 */
export async function expectOrder(
  adminToken: string,
  orderId: string,
  want: { status: string; driver?: boolean },
  previous: string,
) {
  const order = await api<{ status: string; driver: unknown }>('GET', `/admin/orders/${orderId}`, undefined, adminToken);
  expect(order.status, `the order should be «${want.status}» after ${previous}`).toBe(want.status);
  if (want.driver !== undefined) expect(!!order.driver, `driver assigned after ${previous}`).toBe(want.driver);
}
