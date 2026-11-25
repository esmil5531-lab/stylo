import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { Queryable } from './db.js';
import { injectSeo, pageMeta, renderHead, renderNoscript, type SeoConfig } from './seo.js';

interface SeoDeps {
  db: Queryable;
  seo: SeoConfig;
  origin: (req: FastifyRequest) => string;
}

/** Hashed build files never change: cache them for a year. HTML is always revalidated. */
function cacheHeaders(res: { header(name: string, value: string): unknown }, path: string) {
  if (/[\\/](_expo[\\/]static|assets)[\\/]/.test(path)) {
    res.header('cache-control', 'public, max-age=31536000, immutable');
  } else if (path.endsWith('.html')) {
    res.header('cache-control', 'no-cache');
  }
}

/**
 * Serves the two websites from the API process (one origin, no CORS):
 *   /        customer site  — Expo web static export (mobile/dist)
 *   /admin/  back office    — Vite build (admin/dist), a single-page app
 * Both call the API at /v1 on the same origin.
 *
 * The Expo export writes one HTML file per route, with dynamic routes kept as patterns
 * (product/[id].html). Unknown paths are matched against those patterns, so /product/abc
 * serves product/[id].html and the client router reads the id from the URL.
 *
 * Customer pages are sent with their SEO tags filled in for that URL (seo.ts): title, description,
 * canonical, OpenGraph, JSON-LD and a <noscript> summary, so Google and link previews see them.
 */
export async function registerWebsites(
  app: FastifyInstance,
  dirs: { customerDir?: string; adminDir?: string },
  deps?: SeoDeps,
  opts: { production?: boolean } = {},
) {
  const adminDir = dirs.adminDir && resolve(dirs.adminDir);
  const customerDir = dirs.customerDir && resolve(dirs.customerDir);

  if (adminDir && existsSync(join(adminDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: adminDir,
      prefix: '/admin/',
      decorateReply: false,
      wildcard: false,
      cacheControl: false,
      setHeaders: cacheHeaders,
    });
    app.get('/admin', (_req, reply) => reply.redirect('/admin/'));
    // SPA fallback for client-side routes (/admin/orders/123 …).
    // (Read directly: the customer site's static handler refuses .html files.)
    const adminIndex = readFileSync(join(adminDir, 'index.html'), 'utf8');
    app.get('/admin/*', (_req, reply) =>
      reply.header('cache-control', 'no-cache').type('text/html; charset=utf-8').send(adminIndex),
    );
    app.log.info(`back office served at /admin from ${adminDir}`);
  } else {
    // Not built yet: explain instead of a bare 404.
    const page = notBuiltPage('admin', !!opts.production);
    app.get('/admin', (_req, reply) => reply.redirect('/admin/'));
    app.get('/admin/*', (_req, reply) => reply.code(503).type('text/html; charset=utf-8').send(page));
    app.log.warn(`back office not built (${adminDir ?? 'ADMIN_WEB_DIR not set'}): run \`npm run build:admin\` at the repo root`);
  }

  if (customerDir && existsSync(join(customerDir, 'index.html'))) {
    const routes = collectRoutes(customerDir);
    // Static files (JS, fonts, images). HTML pages go through the handler below so they get their tags.
    await app.register(fastifyStatic, {
      root: customerDir,
      prefix: '/',
      wildcard: false,
      index: false,
      allowedPath: (pathName) => !pathName.endsWith('.html'),
      cacheControl: false,
      setHeaders: cacheHeaders,
    });
    // Build output (JS bundles, fonts, images) is looked up on disk per request, so a rebuild
    // while the server runs still serves the new hashed files instead of 404s.
    for (const sub of ['_expo', 'assets']) {
      if (!existsSync(join(customerDir, sub))) continue;
      await app.register(fastifyStatic, {
        root: join(customerDir, sub),
        prefix: `/${sub}/`,
        decorateReply: false,
        wildcard: true,
        cacheControl: false,
        setHeaders: cacheHeaders,
      });
    }

    const check = checkCustomerBuild(customerDir);
    if (!check.ok) app.log.error(`customer site build problem: ${check.problem}`);
    else if (check.repairedScripts) {
      app.log.warn(
        `customer index.html has no bundle <script> (broken export); serving pages with ${check.repairedScripts.join(', ')}. ` +
          'Rebuild with `npm run build:customer` to fix the files.',
      );
    }

    // Re-read a page when its file changes (rebuilds), and make sure it loads the JS bundle.
    const htmlCache = new Map<string, { mtime: number; html: string }>();
    const readHtml = (file: string) => {
      const full = join(customerDir, file);
      const mtime = statSync(full).mtimeMs;
      const cached = htmlCache.get(file);
      if (cached && cached.mtime === mtime) return cached.html;
      const html = ensureBundleScript(readFileSync(full, 'utf8'), customerDir);
      htmlCache.set(file, { mtime, html });
      return html;
    };
    const page = async (req: FastifyRequest, path: string, file: string, status: number) => {
      let html = readHtml(file);
      if (deps) {
        const query = new URLSearchParams(req.url.split('?')[1] ?? '');
        const meta = await pageMeta(deps.db, path, query);
        if (status === 404) meta.noindex = true;
        html = injectSeo(html, renderHead(meta, deps.origin(req), deps.seo), renderNoscript(meta));
        if (meta.status) status = meta.status;
      }
      return { html, status };
    };
    const handler = async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
      const raw = (req.params as { '*'?: string })['*'] ?? '';
      let path: string;
      try {
        path = decodeURIComponent(raw).replace(/\/+$/, '');
      } catch {
        path = raw;
      }
      if (path === 'v1' || path.startsWith('v1/')) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'المسار غير موجود' } });
      }
      // A page without its JS bundle would be blank: explain instead.
      if (!findEntryBundle(customerDir)) {
        return reply
          .code(503)
          .header('cache-control', 'no-store')
          .type('text/html; charset=utf-8')
          .send(notBuiltPage('customer', !!opts.production, true));
      }
      const file = resolveRoute(routes, path);
      const out = await page(req, path, file ?? routes.notFound ?? 'index.html', file ? 200 : 404);
      return reply.code(out.status).header('cache-control', 'no-cache').type('text/html; charset=utf-8').send(out.html);
    };
    app.get('/', handler);
    app.get('/*', handler);
    if (!opts.production) {
      // Development diagnostic: what the server sees in the customer build (open it in the browser).
      app.get('/__stylo/site', async () => checkCustomerBuild(customerDir));
    }
    app.log.info(`customer site served at / from ${customerDir}`);
  } else {
    const page = notBuiltPage('customer', !!opts.production);
    const send = (_req: FastifyRequest, reply: import('fastify').FastifyReply) =>
      reply.code(503).header('cache-control', 'no-store').type('text/html; charset=utf-8').send(page);
    app.get('/', send);
    app.get('/*', (req, reply) => {
      const path = (req.params as { '*'?: string })['*'] ?? '';
      if (path === 'v1' || path.startsWith('v1/')) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'المسار غير موجود' } });
      }
      return send(req, reply);
    });
    app.log.warn(`customer site not built (${customerDir ?? 'CUSTOMER_WEB_DIR not set'}): run \`npm run build:customer\` at the repo root`);
  }
}

/**
 * Shown at / (or /admin/) while the website has not been built: the API itself is fine, only the
 * static export is missing. Development explains how to build it; production shows a neutral page.
 */
function notBuiltPage(site: 'customer' | 'admin', production: boolean, incomplete = false): string {
  const title = site === 'customer' ? 'موقع الزبائن' : 'لوحة الإدارة والمتاجر';
  const command = site === 'customer' ? 'npm run build:customer' : 'npm run build:admin';
  const body = production
    ? `<p>الموقع قيد التجهيز، نعود قريباً.</p>`
    : `<p>الخادم يعمل ✓ لكن <b>${title}</b> ${
        incomplete ? 'بناؤه غير مكتمل (لا توجد ملفات JavaScript في <code dir="ltr">_expo/static/js/web</code>)' : 'لم يُبنَ بعد'
      }، لذلك لا توجد صفحة لعرضها هنا.</p>
       <p>من مجلد المشروع شغّلي أحد الأمرين ثم أعيدي تشغيل الخادم:</p>
       <pre dir="ltr">${command}</pre>
       <pre dir="ltr">npm run build</pre>
       <p class="muted">أو جرّبي التطبيق مباشرة: <code dir="ltr">npm run dev:mobile</code> (Expo Go)،
       ولوحة الإدارة أثناء التطوير: <code dir="ltr">npm --prefix admin run dev</code> ← <span dir="ltr">http://localhost:5174/admin/</span></p>
       <ul>
         <li><a href="/health" dir="ltr">/health</a> — فحص الخادم وقاعدة البيانات</li>
         <li><a href="/v1/home" dir="ltr">/v1/home</a> — بيانات الرئيسية من الـ API</li>
       </ul>`;
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/><meta name="theme-color" content="#0B1F2E"/>
<title>ستايلو — ${title}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;background:#F8F6F1;color:#0B1F2E;padding:16px;box-sizing:border-box}
  main{background:#fff;border:1px solid #E6E1D6;border-radius:8px;padding:28px 24px;max-width:560px;width:100%;box-shadow:0 4px 14px rgba(11,31,46,.05)}
  .word{font-family:Cinzel,Georgia,serif;font-size:34px;letter-spacing:.3em;padding-inline-start:.3em;color:#0B1F2E;text-align:center;margin:0}
  .tag{text-align:center;color:#4A5560;font-weight:600;margin:4px 0 20px}
  p{line-height:1.8;margin:8px 0}
  pre{background:#EFEBE0;border-radius:10px;padding:10px 14px;font-size:15px;margin:8px 0;overflow-x:auto}
  code{background:#EFEBE0;border-radius:6px;padding:1px 6px;white-space:nowrap;unicode-bidi:isolate}
  .muted{color:#5F6870;font-size:14px}
  a{color:#355E5A;font-weight:700}
  ul{padding-inline-start:20px;line-height:1.9}
</style></head>
<body><main>
  <p class="word">STYLO</p>
  <p class="tag">كل ستايل في مكان واحد</p>
  ${body}
</main></body></html>`;
}

const BUNDLE_SRC = /<script[^>]+src="\/?_expo\/static\/js\/web\/[^"]+\.js"/;

/** The newest file with this prefix in the web bundle folder (Expo empties dist/ on export; be safe). */
function newestBundle(customerDir: string, prefix: string): string | null {
  const dir = join(customerDir, '_expo', 'static', 'js', 'web');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.js'))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files[0] ? `/_expo/static/js/web/${files[0].f}` : null;
}

function findEntryBundle(customerDir: string): string | null {
  return newestBundle(customerDir, 'entry-');
}

/**
 * The synchronous scripts a page needs, in Expo's order. A split build (route chunks) has a
 * module runtime and a shared chunk that must load before the entry; a single build has the entry only.
 */
export function bundleScripts(customerDir: string): string[] {
  const entry = findEntryBundle(customerDir);
  if (!entry) return [];
  return [newestBundle(customerDir, '__expo-metro-runtime-'), newestBundle(customerDir, '__common-'), entry].filter(
    (s): s is string => !!s,
  );
}

/**
 * An exported page must load the JS bundle, or the browser shows an empty page with no error.
 * If a page has no bundle <script> (seen with Windows builds), add the bundle scripts.
 * (`mobile/scripts/fix-web-export.mjs` does the same to the files at build time.)
 */
export function ensureBundleScript(html: string, customerDir: string): string {
  if (BUNDLE_SRC.test(html)) return html;
  const tags = bundleScripts(customerDir)
    .map((src) => `<script src="${src}" defer></script>`)
    .join('');
  if (!tags) return html;
  return html.includes('</body>') ? html.replace('</body>', `${tags}</body>`) : html + tags;
}

export interface BuildCheck {
  ok: boolean;
  problem?: string;
  dir: string;
  indexBytes: number;
  scriptsInIndex: { src: string; exists: boolean }[];
  entryBundle: string | null;
  /** Scripts the server adds because index.html has none (a broken export). */
  repairedScripts?: string[];
}

/** Inspects the customer build: is there a JS bundle, and does index.html point at files that exist? */
export function checkCustomerBuild(customerDir: string): BuildCheck {
  const index = join(customerDir, 'index.html');
  const html = existsSync(index) ? readFileSync(index, 'utf8') : '';
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]!);
  const scriptsInIndex = scripts.map((src) => ({
    src,
    exists: existsSync(join(customerDir, decodeURIComponent(src.replace(/^\//, '').split('?')[0]!))),
  }));
  const entryBundle = findEntryBundle(customerDir);
  const base = { dir: customerDir, indexBytes: Buffer.byteLength(html), scriptsInIndex, entryBundle };
  if (!html) return { ...base, ok: false, problem: 'index.html is missing — run `npm run build:customer`' };
  if (!entryBundle) {
    return { ...base, ok: false, problem: 'no JS bundle in _expo/static/js/web — the export is incomplete; run `npm run build:customer` again' };
  }
  const missing = scriptsInIndex.filter((s) => !s.exists && s.src.includes('_expo/'));
  if (missing.length) {
    return { ...base, ok: false, problem: `index.html points to missing files: ${missing.map((m) => m.src).join(', ')}` };
  }
  return BUNDLE_SRC.test(html) ? { ...base, ok: true } : { ...base, ok: true, repairedScripts: bundleScripts(customerDir) };
}

interface RouteTable {
  exact: Map<string, string>;
  dynamic: { re: RegExp; file: string; specificity: number }[];
  notFound?: string;
}

function collectRoutes(root: string): RouteTable {
  const table: RouteTable = { exact: new Map(), dynamic: [] };
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== '_expo' && name !== 'assets') walk(full);
        continue;
      }
      if (!name.endsWith('.html')) continue;
      const file = relative(root, full).split(sep).join('/');
      // Expo's developer route list: never a public page (falls through to the 404 page).
      if (file === '_sitemap.html') continue;
      if (file === '+not-found.html') {
        table.notFound = file;
        continue;
      }
      // Route groups like (tabs) don't appear in URLs.
      const route = file
        .replace(/\.html$/, '')
        .replace(/(^|\/)index$/, '')
        .split('/')
        .filter((seg) => !/^\(.*\)$/.test(seg))
        .join('/');
      if (/\[[^\]]+\]/.test(route)) {
        const pattern = route
          .split('/')
          .map((seg) => (/^\[\.\.\..+\]$/.test(seg) ? '.+' : /^\[.+\]$/.test(seg) ? '[^/]+' : escape(seg)))
          .join('/');
        const specificity = route.split('/').filter((seg) => !seg.startsWith('[')).length;
        table.dynamic.push({ re: new RegExp(`^${pattern}$`), file, specificity });
      } else if (!table.exact.has(route)) {
        table.exact.set(route, file);
      }
    }
  };
  walk(root);
  table.dynamic.sort((a, b) => b.specificity - a.specificity);
  return table;
}

function resolveRoute(t: RouteTable, path: string): string | undefined {
  return t.exact.get(path) ?? t.dynamic.find((d) => d.re.test(path))?.file;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
