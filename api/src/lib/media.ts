import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import sharp from 'sharp';

import type { MediaConfig } from '../config.js';
import { AppError, badRequest } from './errors.js';

/**
 * Photos uploaded from the back office.
 *
 * Every upload is checked to be a real image (not just a file named .jpg), turned upright, stripped
 * of its metadata (EXIF can hold the GPS position of the phone that took it) and saved as WebP in
 * three widths — small for thumbnails, medium for product cards, large for product pages and
 * banners — so the app stays fast on Libyan mobile networks:
 *
 *   <key>-320.webp   <key>-800.webp   <key>-1600.webp
 *
 * The database stores the largest URL; `mediaVariant(url, 800)` gives another size.
 * Storage: `local` (the server's disk, served at /uploads/) or `supabase` (Supabase Storage, public
 * bucket). Both are behind `MediaStorage` so another S3-like store can be added later.
 */

export const MEDIA_WIDTHS = [320, 800, 1600] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];
export type MediaPurpose = 'product' | 'banner' | 'look' | 'category';

/**
 * First bytes of the formats we accept. Checked before sharp sees the file so SVG, TIFF, PDF and
 * other formats never reach their (larger, riskier) decoders.
 */
function looksLikePhoto(b: Buffer): boolean {
  const ascii = (from: number, to: number) => b.subarray(from, to).toString('latin1');
  return (
    (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || // JPEG
    ascii(0, 8) === '\x89PNG\r\n\x1a\n' || // PNG
    (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') || // WebP
    ascii(0, 4) === 'GIF8' || // GIF
    ascii(4, 8) === 'ftyp' // AVIF / HEIF
  );
}

/** Formats we accept (detected from the bytes, not the file name). */
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);

/** URLs our uploads produce: /uploads/<key>-1600.webp, or a storage URL ending the same way. */
const VARIANT = /-(320|800|1600)\.webp$/;

/** Another size of an uploaded photo; external URLs are returned unchanged. */
export function mediaVariant<T extends string | null | undefined>(url: T, width: MediaWidth): T {
  if (!url || !VARIANT.test(url)) return url;
  return url.replace(VARIANT, `-${width}.webp`) as T;
}

/** Image URL accepted in forms: an uploaded photo (/uploads/…webp) or an http(s) link. */
export function isMediaUrl(v: string): boolean {
  return /^\/uploads\/[a-z0-9/-]+-(320|800|1600)\.webp$/.test(v) || /^https?:\/\/\S+$/.test(v);
}

export interface MediaStorage {
  readonly driver: 'local' | 'supabase';
  /** Stores one file and returns its public URL. */
  put(path: string, body: Buffer, contentType: string): Promise<string>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function createStorage(cfg: MediaConfig, fetchImpl: FetchLike = (u, i) => fetch(u, i)): MediaStorage {
  if (cfg.driver === 'supabase' && cfg.supabase) {
    const { url, serviceKey, bucket } = cfg.supabase;
    return {
      driver: 'supabase',
      async put(path, body, contentType) {
        const res = await fetchImpl(`${url}/storage/v1/object/${bucket}/${path}`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            'content-type': contentType,
            'cache-control': 'max-age=31536000',
            'x-upsert': 'false',
          },
          body: new Uint8Array(body),
          signal: AbortSignal.timeout(30_000),
        }).catch(() => null);
        if (!res?.ok) {
          throw new AppError(502, 'storage_failed', 'تعذّر حفظ الصورة في التخزين، حاولي مرة أخرى', {
            status: res?.status,
          });
        }
        return `${url}/storage/v1/object/public/${bucket}/${path}`;
      },
    };
  }
  const root = resolve(cfg.localDir);
  return {
    driver: 'local',
    async put(path, body) {
      const file = join(root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body, { flag: 'wx' });
      return `/uploads/${path}`;
    },
  };
}

export interface ProcessedImage {
  key: string;
  url: string;
  urls: Record<'sm' | 'md' | 'lg', string>;
  width: number;
  height: number;
  bytes: number;
}

/** Validates, resizes and stores one uploaded photo. `now` names the folder (purpose/YYYY/MM). */
export async function storeImage(
  storage: MediaStorage,
  input: Buffer,
  purpose: MediaPurpose,
  now: Date,
  maxBytes: number,
): Promise<ProcessedImage> {
  if (input.length === 0) throw badRequest('empty_file', 'الملف فارغ');
  if (input.length > maxBytes) {
    throw new AppError(413, 'file_too_large', `حجم الصورة أكبر من ${Math.round(maxBytes / 1_048_576)} ميغابايت`);
  }

  if (!looksLikePhoto(input)) throw badRequest('not_an_image', 'الملف ليس صورة صالحة (JPG أو PNG أو WebP)');
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    meta = await sharp(input, { limitInputPixels: 60_000_000 }).metadata();
  } catch {
    throw badRequest('not_an_image', 'الملف ليس صورة صالحة (JPG أو PNG أو WebP)');
  }
  if (!meta.format || !ACCEPTED.has(meta.format) || !meta.width || !meta.height) {
    throw badRequest('not_an_image', 'الملف ليس صورة صالحة (JPG أو PNG أو WebP)');
  }
  if (Math.min(meta.width, meta.height) < 200) {
    throw badRequest('image_too_small', 'الصورة صغيرة جداً، استخدمي صورة بعرض 600 بكسل على الأقل');
  }

  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const key = `${purpose}/${yyyy}/${mm}/${randomUUID()}`;

  const out: Partial<Record<MediaWidth, string>> = {};
  let bytes = 0;
  let size = { width: meta.width, height: meta.height };
  for (const w of MEDIA_WIDTHS) {
    // rotate() applies the EXIF orientation; WebP output carries no EXIF (GPS, camera…).
    const result = await sharp(input, { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: w, height: w, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: w === 320 ? 75 : 82 })
      .toBuffer({ resolveWithObject: true })
      .catch(() => null);
    if (!result) {
      // e.g. iPhone HEIC (HEVC) or a truncated file: readable header, undecodable pixels.
      throw badRequest('unsupported_image', 'تعذّرت قراءة الصورة. احفظيها بصيغة JPG أو PNG ثم أعيدي الرفع');
    }
    const { data, info } = result;
    out[w] = await storage.put(`${key}-${w}.webp`, data, 'image/webp');
    bytes += data.length;
    if (w === 1600) size = { width: info.width, height: info.height };
  }
  return {
    key,
    url: out[1600]!,
    urls: { sm: out[320]!, md: out[800]!, lg: out[1600]! },
    width: size.width,
    height: size.height,
    bytes,
  };
}
