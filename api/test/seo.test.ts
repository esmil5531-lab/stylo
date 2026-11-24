/**
 * Google & link previews: robots.txt, sitemap.xml and per-page tags injected into the customer site.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = new URL('../../database/', import.meta.url).pathname;
const DRESS = '30000000-0000-0000-0000-000000000001';
const SITE = 'https://stylo.example';

let pool: Pool;
let app: FastifyInstance; // indexing on, like production
let staging: FastifyInstance; // indexing off

/** A tiny stand-in for the Expo static export (same shape: empty title, route files). */
function fakeSite(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stylo-site-'));
  const page = (name: string) =>
    `<!DOCTYPE html><html lang="ar" dir="rtl"><head><title data-rh="true"></title><meta charSet="utf-8"/></head><body><div id="root">${name}</div></body></html>`;
  mkdirSync(join(dir, 'product'));
  mkdirSync(join(dir, 'store'));
  mkdirSync(join(dir, '_expo/static/js'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), page('home'));
  writeFileSync(join(dir, 'cart.html'), page('cart'));
  writeFileSync(join(dir, '+not-found.html'), page('404'));
  writeFileSync(join(dir, 'product/[id].html'), page('product'));
  writeFileSync(join(dir, 'store/[slug].html'), page('store'));
  writeFileSync(join(dir, '_expo/static/js/app-abc123.js'), 'console.log(1)');
  return dir;
}

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
  const site = fakeSite();
  const env = { NODE_ENV: 'test', DATABASE_URL: TEST_DB, CUSTOMER_WEB_DIR: site, PUBLIC_SITE_URL: SITE };
  app = await buildApp({
    pool,
    config: loadConfig({ ...env, SEO_INDEXING: 'true', GOOGLE_SITE_VERIFICATION: 'abcDEF123_verify' }),
    logger: false,
  });
  staging = await buildApp({ pool, config: loadConfig(env), logger: false });
});

after(async () => {
  await app?.close();
  await staging?.close();
  await pool?.end();
});

describe('robots.txt & sitemap.xml', () => {
  it('lets Google in, keeps private areas out, points to the sitemap', async () => {
    const res = await app.inject('/robots.txt');
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /^User-agent: \*\nAllow: \//);
    for (const p of ['/admin/', '/v1/', '/cart', '/driver', '/account']) assert.ok(res.body.includes(`Disallow: ${p}`), p);
    assert.ok(res.body.includes(`Sitemap: ${SITE}/sitemap.xml`));
  });

  it('staging (indexing off) blocks everything', async () => {
    assert.equal((await staging.inject('/robots.txt')).body, 'User-agent: *\nDisallow: /\n');
  });

  it('lists public pages with absolute https URLs', async () => {
    const res = await app.inject('/sitemap.xml');
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'] as string, /xml/);
    assert.ok(res.body.includes(`<loc>${SITE}/</loc>`));
    assert.ok(res.body.includes(`<loc>${SITE}/product/${DRESS}</loc>`));
    assert.ok(res.body.includes(`<loc>${SITE}/store/laura</loc>`));
    assert.ok(!res.body.includes('/admin'));
    const draft = await pool.query(`SELECT id FROM products WHERE status <> 'active' LIMIT 1`);
    if (draft.rows[0]) assert.ok(!res.body.includes(draft.rows[0].id));
  });
});

describe('page tags for Google and link previews', () => {
  it('product page: title, description with LYD price, canonical, OpenGraph, Product JSON-LD', async () => {
    const res = await app.inject(`/product/${DRESS}`);
    assert.equal(res.statusCode, 200);
    const html = res.body;
    assert.match(html, /<head><meta charSet="utf-8"\/><title>فستان ملفوف عنابي — أزياء لورا \| ستايلو<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]*199 د.ل/);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE}/product/${DRESS}"/>`));
    assert.ok(html.includes('<meta property="og:type" content="product"/>'));
    assert.ok(html.includes('<meta name="robots" content="index, follow, max-image-preview:large"/>'));
    assert.ok(html.includes('<meta name="google-site-verification" content="abcDEF123_verify"/>'));
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1]!);
    assert.equal(ld['@type'], 'Product');
    assert.equal(ld.offers.priceCurrency, 'LYD');
    assert.equal(ld.offers.price, '199.000');
    assert.equal(ld.offers.url, `${SITE}/product/${DRESS}`);
    assert.ok(html.includes('<noscript><main dir="rtl"><h1>فستان ملفوف عنابي</h1>'));
    assert.equal((html.match(/<title/g) ?? []).length, 1, 'the empty Expo title is replaced');
  });

  it('private pages are noindex; unknown products are 404 + noindex', async () => {
    assert.match((await app.inject('/cart')).body, /<meta name="robots" content="noindex, nofollow"\/>/);
    const missing = await app.inject('/product/00000000-0000-0000-0000-0000000000ff');
    assert.equal(missing.statusCode, 404);
    assert.match(missing.body, /noindex/);
    assert.equal((await app.inject('/no/such/page')).statusCode, 404);
  });

  it('staging pages are noindex; hashed assets are cached for a year', async () => {
    assert.match((await staging.inject('/')).body, /<meta name="robots" content="noindex, nofollow"\/>/);
    const js = await app.inject('/_expo/static/js/app-abc123.js');
    assert.equal(js.statusCode, 200);
    assert.equal(js.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(js.headers['x-content-type-options'], 'nosniff');
    assert.equal((await app.inject('/v1/home')).headers['x-robots-tag'], 'noindex, nofollow');
  });

  it('production refuses to start without an https PUBLIC_SITE_URL', () => {
    assert.throws(
      () => loadConfig({ NODE_ENV: 'production', OTP_PEPPER: 'x'.repeat(32), MESSAGING_PROVIDER: 'whatsapp' }),
      /PUBLIC_SITE_URL/,
    );
  });
});
