import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * Serves the two websites from the API process (one origin, no CORS):
 *   /        customer site  — Expo web static export (mobile/dist)
 *   /admin/  back office    — Vite build (admin/dist), a single-page app
 * Both call the API at /v1 on the same origin.
 *
 * The Expo export writes one HTML file per route, with dynamic routes kept as patterns
 * (product/[id].html). Unknown paths are matched against those patterns, so /product/abc
 * serves product/[id].html and the client router reads the id from the URL.
 */
export async function registerWebsites(app: FastifyInstance, dirs: { customerDir?: string; adminDir?: string }) {
  const adminDir = dirs.adminDir && resolve(dirs.adminDir);
  const customerDir = dirs.customerDir && resolve(dirs.customerDir);

  if (adminDir && existsSync(join(adminDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: adminDir, prefix: '/admin/', decorateReply: false, wildcard: false });
    app.get('/admin', (_req, reply) => reply.redirect('/admin/'));
    // SPA fallback for client-side routes (/admin/orders/123 …).
    app.get('/admin/*', (_req, reply) => reply.type('text/html').sendFile('index.html', adminDir));
    app.log.info(`back office served at /admin from ${adminDir}`);
  }

  if (customerDir && existsSync(join(customerDir, 'index.html'))) {
    const routes = collectRoutes(customerDir);
    await app.register(fastifyStatic, { root: customerDir, prefix: '/', wildcard: false });
    app.get('/*', (req, reply) => {
      const path = decodeURIComponent((req.params as { '*': string })['*'] ?? '').replace(/\/+$/, '');
      if (path === 'v1' || path.startsWith('v1/')) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'المسار غير موجود' } });
      }
      const file = resolveRoute(routes, path);
      if (file) return reply.type('text/html').sendFile(file, customerDir);
      return reply.code(404).type('text/html').sendFile(routes.notFound ?? 'index.html', customerDir);
    });
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
