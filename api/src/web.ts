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
  }
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
