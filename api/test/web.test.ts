/**
 * The websites are not built yet: / and /admin/ explain how to build them instead of a bare 404,
 * while the API keeps answering.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';

let pool: Pool;
let app: FastifyInstance;

before(async () => {
  pool = createPool(TEST_DB);
  const empty = mkdtempSync(join(tmpdir(), 'stylo-empty-'));
  app = await buildApp({
    pool,
    config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, CUSTOMER_WEB_DIR: empty, ADMIN_WEB_DIR: empty }),
    logger: false,
  });
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('websites not built', () => {
  it('/ explains how to build the customer site (Arabic, RTL, brand)', async () => {
    const res = await app.inject('/');
    assert.equal(res.statusCode, 503);
    assert.match(res.headers['content-type'] as string, /text\/html/);
    assert.ok(res.body.includes('<html lang="ar" dir="rtl">'));
    assert.ok(res.body.includes('كل ستايل في مكان واحد'));
    assert.ok(res.body.includes('npm run build:customer'));
    assert.equal((await app.inject('/product/abc')).statusCode, 503);
  });

  it('/admin/ explains how to build the back office', async () => {
    assert.equal((await app.inject('/admin')).statusCode, 302);
    const res = await app.inject('/admin/orders');
    assert.equal(res.statusCode, 503);
    assert.ok(res.body.includes('npm run build:admin'));
  });

  it('the API keeps answering', async () => {
    assert.equal((await app.inject('/health')).statusCode, 200);
    const missing = await app.inject('/v1/nope');
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, 'not_found');
  });

  it('outside tests the build folders default to the repo, wherever the server starts', () => {
    const cfg = loadConfig({ NODE_ENV: 'development' });
    assert.match(cfg.web.customerDir!, /mobile[\\/]dist$/);
    assert.match(cfg.web.adminDir!, /admin[\\/]dist$/);
  });
});

/** An Expo-style export; `script: false` mimics an index.html that lost its bundle <script>. */
function site(opts: { script: boolean; bundle: boolean }) {
  const dir = mkdtempSync(join(tmpdir(), 'stylo-site-'));
  const js = '/_expo/static/js/web/entry-111aaa.js';
  const page = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><title data-rh="true"></title><meta charSet="utf-8"/></head><body><div id="root"></div>${
    opts.script ? `<script src="${js}" defer></script>` : ''
  }</body></html>`;
  writeFileSync(join(dir, 'index.html'), page);
  writeFileSync(join(dir, 'cart.html'), page);
  if (opts.bundle) {
    mkdirSync(join(dir, '_expo/static/js/web'), { recursive: true });
    writeFileSync(join(dir, '_expo/static/js/web/entry-111aaa.js'), 'console.log("stylo")');
  }
  return dir;
}

async function appFor(dir: string) {
  return buildApp({
    pool,
    config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, CUSTOMER_WEB_DIR: dir }),
    logger: false,
  });
}

describe('customer build problems', () => {
  it('a page without its bundle <script> gets it added (no more blank page)', async () => {
    const dir = site({ script: false, bundle: true });
    const a = await appFor(dir);
    try {
      const res = await a.inject('/');
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('<script src="/_expo/static/js/web/entry-111aaa.js" defer></script></body>'));
      const js = await a.inject('/_expo/static/js/web/entry-111aaa.js');
      assert.equal(js.statusCode, 200);
      assert.match(js.headers['content-type'] as string, /javascript/);
      const report = (await a.inject('/__stylo/site')).json();
      assert.equal(report.ok, true);
      assert.equal(report.repairedScript, '/_expo/static/js/web/entry-111aaa.js');
    } finally {
      await a.close();
    }
  });

  it('a normal page is served unchanged (one script)', async () => {
    const a = await appFor(site({ script: true, bundle: true }));
    try {
      const html = (await a.inject('/cart')).body;
      assert.equal(html.match(/entry-111aaa\.js/g)?.length, 1);
    } finally {
      await a.close();
    }
  });

  it('no JS bundle at all: explains the incomplete build instead of a blank page', async () => {
    const a = await appFor(site({ script: true, bundle: false }));
    try {
      const res = await a.inject('/');
      assert.equal(res.statusCode, 503);
      assert.ok(res.body.includes('غير مكتمل'));
      const report = (await a.inject('/__stylo/site')).json();
      assert.equal(report.ok, false);
      assert.match(report.problem, /no JS bundle/);
    } finally {
      await a.close();
    }
  });

  it('a rebuild while the server runs: new bundle and new HTML are served without restart', async () => {
    const dir = site({ script: true, bundle: true });
    const a = await appFor(dir);
    try {
      await a.inject('/');
      writeFileSync(join(dir, '_expo/static/js/web/entry-222bbb.js'), 'console.log("v2")');
      const later = new Date(Date.now() + 5000);
      writeFileSync(
        join(dir, 'index.html'),
        '<!DOCTYPE html><html><head><meta charSet="utf-8"/></head><body><script src="/_expo/static/js/web/entry-222bbb.js" defer></script></body></html>',
      );
      const { utimesSync } = await import('node:fs');
      utimesSync(join(dir, 'index.html'), later, later);
      assert.ok((await a.inject('/')).body.includes('entry-222bbb.js'));
      assert.equal((await a.inject('/_expo/static/js/web/entry-222bbb.js')).statusCode, 200);
    } finally {
      await a.close();
    }
  });
});
