#!/usr/bin/env node
/**
 * Checks a running Stylo server from the outside (no browser, no database access needed):
 *   node scripts/check-site.mjs                      → http://localhost:4000
 *   node scripts/check-site.mjs http://10.0.0.5:4000 → another machine on the network
 *
 * 1. /health: the API answers and the database is connected.
 * 2. The customer site at /: every page of the Expo export (static and dynamic routes with real
 *    ids taken from the API) answers 200 and carries its bundle <script>, and every bundle loads.
 * 3. Unknown links answer the branded 404 page; Expo's /_sitemap is never public.
 * 4. SEO files, the back office at /admin/ (+ its assets and deep links) and the main /v1 endpoints.
 * Exit code 0 = everything passed.
 */
const BASE = (process.argv[2] ?? 'http://localhost:4000').replace(/\/+$/, '');
const results = [];
const seenScripts = new Map();

function record(ok, what, detail = '') {
  results.push({ ok, what, detail });
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? `  — ${detail}` : ''}`);
}

async function get(path, init) {
  try {
    const res = await fetch(BASE + path, { redirect: 'manual', ...init });
    const body = await res.text();
    return { status: res.status, type: res.headers.get('content-type') ?? '', body };
  } catch (err) {
    return { status: 0, type: '', body: '', error: err.cause?.code ?? err.message };
  }
}

async function json(path) {
  const r = await get(path);
  try {
    return { ...r, data: JSON.parse(r.body) };
  } catch {
    return { ...r, data: null };
  }
}

/** A page of the Expo export: expected status, HTML, and every bundle <script> loads. */
async function page(path, expected = 200) {
  const r = await get(path);
  if (r.status !== expected) return record(false, `GET ${path}`, r.error ?? `status ${r.status} (expected ${expected})`);
  if (!r.type.includes('text/html')) return record(false, `GET ${path}`, `not HTML (${r.type})`);
  const scripts = [...r.body.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);
  const bundles = scripts.filter((s) => s.includes('/_expo/static/js/web/'));
  if (bundles.length === 0) return record(false, `GET ${path}`, 'no bundle <script> in the page (white screen) — run: npm run build:customer');
  for (const src of bundles) {
    if (!seenScripts.has(src)) {
      const s = await get(src);
      seenScripts.set(src, s.status === 200 && /javascript/.test(s.type) ? '' : `bundle ${src} → ${s.status} ${s.type}`);
    }
    if (seenScripts.get(src)) return record(false, `GET ${path}`, seenScripts.get(src));
  }
  record(true, `GET ${path}`, `${r.status}, ${bundles.length} bundle${bundles.length > 1 ? 's' : ''}`);
}

async function api(path, check = () => true) {
  const r = await json(path);
  const ok = r.status === 200 && r.data !== null && check(r.data);
  record(ok, `API ${path}`, ok ? '' : r.error ?? `status ${r.status} ${r.data?.error?.message ?? r.body.slice(0, 120)}`);
  return ok ? r.data : null;
}

console.log(`Stylo site check → ${BASE}\n`);

// 1. Server + database
const health = await json('/health');
if (health.status === 0) {
  record(false, 'server reachable', `${health.error} — is "npm start" running and is the address right?`);
  process.exit(1);
}
record(health.status === 200 && health.data?.database === 'connected', 'GET /health (database)', health.body.slice(0, 160));

// 2. API data used by the pages (and real ids for the dynamic routes)
await api('/v1/home'); // banners, feeds and looks of the home screen
await api('/v1/categories', (d) => Array.isArray(d.items ?? d));
const products = await api('/v1/products?limit=1', (d) => Array.isArray(d.items) && typeof d.total === 'number');
await api('/v1/products/facets');
await api('/v1/cities');
const looks = await api('/v1/looks');
const stores = await api('/v1/stores');
const productId = products?.items?.[0]?.id;
const lookId = (looks?.items ?? looks ?? [])[0]?.id;
const storeSlug = (stores?.items ?? stores ?? [])[0]?.slug;
if (productId) await api(`/v1/products/${productId}/reviews`);
// A guest session (what the site creates on the first add to cart).
const guest = await get('/v1/auth/guest', { method: 'POST' });
record(guest.status === 200 || guest.status === 201 || guest.status === 429, 'API POST /v1/auth/guest', `status ${guest.status}`);
const me = await get('/v1/me');
record(me.status === 401, 'API /v1/me without sign-in → 401', `status ${me.status}`);

// 3. Customer site: the 27 routes of mobile/dist (+not-found and _sitemap below)
console.log('');
const routes = [
  '/', '/cart', '/categories', '/account', '/wishlist', '/products', '/products?q=%D9%81%D8%B3%D8%AA%D8%A7%D9%86',
  '/login', '/onboarding', '/notifications', '/orders', '/addresses', '/addresses/new', '/profile', '/delete-account', '/driver',
  '/legal/terms', '/legal/privacy', '/legal/returns',
  // Private dynamic pages: the shell loads and asks for sign-in in the browser.
  '/orders/00000000-0000-4000-8000-000000000000', '/addresses/00000000-0000-4000-8000-000000000000',
  '/shared-cart/check0000000',
];
if (productId) routes.push(`/product/${productId}`);
else record(false, 'product page', 'no product on sale to test /product/:id');
if (lookId) routes.push(`/look/${lookId}`);
if (storeSlug) routes.push(`/store/${storeSlug}`);
for (const r of routes) await page(r);

// 4. Unknown links → branded 404 (and the router's internal file list stays private)
await page('/no-such-page', 404);
await page('/product/00000000-0000-4000-8000-000000000000', 404);
await page('/_sitemap', 404); // the app renders its 404 page there too (src/app/_sitemap.tsx)

// 5. SEO
const robots = await get('/robots.txt');
record(robots.status === 200 && /User-agent/i.test(robots.body), 'GET /robots.txt', `status ${robots.status}`);
const sitemap = await get('/sitemap.xml');
record(sitemap.status === 200 && sitemap.body.includes('<urlset'), 'GET /sitemap.xml', `status ${sitemap.status}`);

// 6. Back office
console.log('');
const admin = await get('/admin/');
const adminAssets = [...admin.body.matchAll(/(?:src|href)="(\/admin\/assets\/[^"]+)"/g)].map((m) => m[1]);
record(admin.status === 200 && adminAssets.length > 0, 'GET /admin/', admin.status === 200 ? `${adminAssets.length} assets` : `status ${admin.status} — run: npm run build:admin, then restart`);
for (const a of adminAssets) {
  const r = await get(a);
  record(r.status === 200, `GET ${a}`, `status ${r.status}`);
}
const deep = await get('/admin/orders');
record(deep.status === 200 && deep.body.includes('/admin/assets/'), 'GET /admin/orders (deep link)', `status ${deep.status}`);
const adminApi = await get('/v1/admin/dashboard');
record(adminApi.status === 401, 'API /v1/admin/* without sign-in → 401', `status ${adminApi.status}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — ${failed.length} failed:` : ' ✓'}`);
for (const f of failed) console.log(`  ✗ ${f.what}  — ${f.detail}`);
process.exit(failed.length ? 1 : 0);
