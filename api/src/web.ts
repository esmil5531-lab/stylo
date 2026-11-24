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
function cacheHeaders(res: { setHeader(name: string, value: string): unknown }, path: string) {
  if (/[\\/](_expo[\\/]static|assets)[\\/]/.test(path)) {
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
  } else if (path.endsWith('.html')) {
    res.setHeader('cache-control', 'no-cache');
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
    const htmlCache = new Map<string, string>();
    const readHtml = (file: string) => {
      let html = htmlCache.get(file);
      if (html === undefined) {
        html = readFileSync(join(customerDir, file), 'utf8');
        htmlCache.set(file, html);
      }
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
      const file = resolveRoute(routes, path);
      const out = await page(req, path, file ?? routes.notFound ?? 'index.html', file ? 200 : 404);
      return reply.code(out.status).header('cache-control', 'no-cache').type('text/html; charset=utf-8').send(out.html);
    };
    app.get('/', handler);
    app.get('/*', handler);
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
function notBuiltPage(site: 'customer' | 'admin', production: boolean): string {
  const title = site === 'customer' ? 'موقع الزبائن' : 'لوحة الإدارة والمتاجر';
  const command = site === 'customer' ? 'npm run build:customer' : 'npm run build:admin';
  const body = production
    ? `<p>الموقع قيد التجهيز، نعود قريباً.</p>`
    : `<p>الخادم يعمل ✓ لكن <b>${title}</b> لم يُبنَ بعد، لذلك لا توجد صفحة لعرضها هنا.</p>
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
<meta name="robots" content="noindex"/><meta name="theme-color" content="#5B0E2D"/>
<title>ستايلو — ${title}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:Cairo,'Segoe UI',Tahoma,sans-serif;background:#F4DFE6;color:#1A1A1C;padding:16px;box-sizing:border-box}
  main{background:#fff;border-radius:20px;padding:28px 24px;max-width:560px;width:100%;box-shadow:0 4px 18px rgba(91,14,45,.08)}
  .word{font-family:Cinzel,Georgia,serif;font-size:34px;letter-spacing:4px;color:#5B0E2D;text-align:center;margin:0}
  .tag{text-align:center;color:#3F0820;font-weight:600;margin:4px 0 20px}
  p{line-height:1.8;margin:8px 0}
  pre{background:#F4F1F2;border-radius:10px;padding:10px 14px;font-size:15px;margin:8px 0;overflow-x:auto}
  code{background:#F4F1F2;border-radius:6px;padding:1px 6px;white-space:nowrap;unicode-bidi:isolate}
  .muted{color:#625D60;font-size:14px}
  a{color:#5B0E2D;font-weight:700}
  ul{padding-inline-start:20px;line-height:1.9}
</style></head>
<body><main>
  <p class="word">STYLO</p>
  <p class="tag">كل ستايل في مكان واحد</p>
  ${body}
</main></body></html>`;
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
