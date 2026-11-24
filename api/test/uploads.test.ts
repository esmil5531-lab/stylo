/**
 * Photo uploads from the back office (المرحلة 3): validation, three WebP sizes, metadata stripped,
 * permissions per purpose, disk and Supabase Storage.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';
import { mediaVariant } from '../src/lib/media.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const ROOT = fileURLToPath(new URL('../../database/', import.meta.url));
const ADMIN = '00000000-0000-0000-0000-000000000001';
const SUPPORT = '00000000-0000-0000-0000-000000000007';
const LAURA_OWNER = '00000000-0000-0000-0000-000000000002';
const LAURA = '10000000-0000-0000-0000-000000000001';
const DRESS = '30000000-0000-0000-0000-000000000001';

let pool: Pool;
let app: FastifyInstance;
let uploads: string;

/** A real photo: 2400×1800 JPEG with EXIF (camera + GPS) and a rotation flag. */
async function photo(width = 2400, height = 1800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#5B0E2D' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'TestPhone', Model: 'X' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '32/1 53/1 0/1' } })
    .toBuffer();
}

function upload(user: string, purpose: string, body: Buffer, type = 'image/jpeg') {
  return app.inject({
    method: 'POST',
    url: `/v1/admin/uploads?purpose=${purpose}`,
    payload: body,
    headers: { 'x-user-id': user, 'content-type': type },
  });
}

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
  uploads = mkdtempSync(join(tmpdir(), 'stylo-uploads-'));
  app = await buildApp({
    pool,
    config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, AUTH_DEV_HEADER: 'true', UPLOADS_DIR: uploads, MEDIA_MAX_MB: '2' }),
    logger: false,
  });
});

after(async () => {
  await app?.close();
  await pool?.end();
});

describe('uploading a photo', () => {
  let lg = '';

  it('stores three WebP sizes on disk, served for a year, and records the upload', async () => {
    const res = await upload(LAURA_OWNER, 'product', await photo());
    assert.equal(res.statusCode, 201, res.body);
    const img = res.json();
    lg = img.url;
    assert.match(img.url, /^\/uploads\/product\/\d{4}\/\d{2}\/[0-9a-f-]{36}-1600\.webp$/);
    assert.equal(img.urls.md, img.url.replace('-1600.webp', '-800.webp'));
    assert.equal(img.width, 1600);
    assert.equal(img.height, 1200);

    for (const [size, url] of [[320, img.urls.sm], [800, img.urls.md], [1600, img.urls.lg]] as const) {
      const file = join(uploads, url.replace('/uploads/', ''));
      assert.ok(existsSync(file), url);
      const meta = await sharp(file).metadata();
      assert.equal(meta.format, 'webp');
      assert.equal(meta.width, size);
      // EXIF (phone model, GPS) is gone.
      assert.equal(meta.exif, undefined);
    }
    const served = await app.inject(img.urls.md);
    assert.equal(served.statusCode, 200);
    assert.equal(served.headers['content-type'], 'image/webp');
    assert.equal(served.headers['cache-control'], 'public, max-age=31536000, immutable');

    const row = await pool.query(`SELECT purpose, store_id, storage, width FROM media WHERE id = $1`, [img.id]);
    assert.deepEqual(row.rows[0], { purpose: 'product', store_id: LAURA, storage: 'local', width: 1600 });
  });

  it('a product saved with the uploaded photo: cards get the 800 px size, the product page the large one', async () => {
    const product = (await app.inject({ url: `/v1/admin/products/${DRESS}`, headers: { 'x-user-id': LAURA_OWNER } })).json();
    const body = {
      categoryId: product.category?.id ?? null,
      nameAr: product.nameAr,
      basePrice: product.basePrice,
      compareAtPrice: product.compareAtPrice,
      status: product.status,
      images: [lg],
      variants: product.variants.map((v: Record<string, unknown>) => ({
        id: v.id,
        size: v.size,
        colorName: v.colorName,
        colorHex: v.colorHex,
        sku: v.sku,
        stock: v.stock,
      })),
    };
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/products/${DRESS}`,
      payload: body,
      headers: { 'x-user-id': LAURA_OWNER },
    });
    assert.equal(res.statusCode, 200, res.body);
    const card = (await app.inject('/v1/products?category=women-dresses')).json().items.find((p: { id: string }) => p.id === DRESS);
    assert.equal(card.imageUrl, mediaVariant(lg, 800));
    const page = (await app.inject(`/v1/products/${DRESS}`)).json();
    assert.equal(page.images[0].url, lg);

    // Image fields only take uploaded photos or http(s) links.
    const bad = await app.inject({
      method: 'PUT',
      url: `/v1/admin/products/${DRESS}`,
      payload: { ...body, images: ['javascript:alert(1)'] },
      headers: { 'x-user-id': LAURA_OWNER },
    });
    assert.equal(bad.statusCode, 400);
  });

  it('refuses files that are not real images, tiny images and oversized files', async () => {
    let res = await upload(ADMIN, 'banner', Buffer.from('<?php echo "hi"; ?>'), 'image/png');
    assert.equal(res.json().error.code, 'not_an_image');
    // A valid header with the pixels cut off: readable metadata, undecodable image.
    const cut = (await photo()).subarray(0, 4000);
    res = await upload(ADMIN, 'banner', cut);
    assert.equal(res.statusCode, 400, res.body);
    res = await upload(ADMIN, 'banner', await photo(120, 120));
    assert.equal(res.json().error.code, 'image_too_small');
    const huge = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: '#ffffff' } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    res = await upload(ADMIN, 'banner', huge, 'image/png');
    assert.equal(res.statusCode, 413);
    res = await app.inject({
      method: 'POST',
      url: '/v1/admin/uploads?purpose=banner',
      payload: { url: 'x' },
      headers: { 'x-user-id': ADMIN },
    });
    assert.equal(res.json().error.code, 'image_required');
  });

  it('the purpose decides who may upload', async () => {
    assert.equal((await upload(LAURA_OWNER, 'banner', await photo())).statusCode, 403);
    assert.equal((await upload(LAURA_OWNER, 'category', await photo())).statusCode, 403);
    assert.equal((await upload(LAURA_OWNER, 'look', await photo())).statusCode, 201);
    assert.equal((await upload(SUPPORT, 'product', await photo())).statusCode, 403);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/uploads?purpose=product',
      payload: await photo(),
      headers: { 'content-type': 'image/jpeg' },
    });
    assert.equal(res.statusCode, 401);
  });
});

describe('Supabase Storage', () => {
  it('uploads the three sizes to the bucket with the service key and returns public URLs', async () => {
    const calls: { url: string; auth: string | null; type: string | null }[] = [];
    const supa = await buildApp({
      pool,
      config: loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: TEST_DB,
        AUTH_DEV_HEADER: 'true',
        MEDIA_STORAGE: 'supabase',
        SUPABASE_URL: 'https://abcd.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests-0123456789',
      }),
      logger: false,
      mediaFetch: async (url, init) => {
        const h = new Headers(init.headers);
        calls.push({ url, auth: h.get('authorization'), type: h.get('content-type') });
        return new Response('{}', { status: 200 });
      },
    });
    try {
      const res = await supa.inject({
        method: 'POST',
        url: '/v1/admin/uploads?purpose=banner',
        payload: await photo(),
        headers: { 'x-user-id': ADMIN, 'content-type': 'image/jpeg' },
      });
      assert.equal(res.statusCode, 201, res.body);
      assert.equal(calls.length, 3);
      assert.match(calls[0]!.url, /^https:\/\/abcd\.supabase\.co\/storage\/v1\/object\/media\/banner\/\d{4}\/\d{2}\/[0-9a-f-]+-320\.webp$/);
      assert.equal(calls[0]!.auth, 'Bearer service-role-key-for-tests-0123456789');
      assert.equal(calls[0]!.type, 'image/webp');
      assert.match(res.json().url, /^https:\/\/abcd\.supabase\.co\/storage\/v1\/object\/public\/media\/banner\/.+-1600\.webp$/);
      // No local /uploads/ route with Supabase storage (the site fallback answers, never a file).
      const local = await supa.inject('/uploads/anything-1600.webp');
      assert.notEqual(local.headers['content-type'], 'image/webp');
    } finally {
      await supa.close();
    }
  });

  it('production config refuses supabase storage without its key', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'test', MEDIA_STORAGE: 'supabase' }), /SUPABASE_URL/);
  });
});
