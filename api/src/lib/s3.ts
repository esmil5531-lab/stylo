import { createHash, createHmac } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Minimal S3-compatible client (AWS Signature V4, path-style URLs) for off-site backups:
 * Cloudflare R2, Backblaze B2, AWS S3, MinIO… No SDK dependency. Uploads stream the file
 * (single PUT, up to 5 GB) with `UNSIGNED-PAYLOAD`; downloads stream to disk.
 */
export interface S3Config {
  /** e.g. https://<account>.r2.cloudflarestorage.com or https://s3.eu-central-003.backblazeb2.com */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** R2: "auto". */
  region: string;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
}

const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding as S3 expects (slashes kept in paths). */
function encode(value: string, keepSlash = false): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%2F/g, keepSlash ? '/' : '%2F');
}

export interface SignInput {
  method: string;
  host: string;
  /** Already-encoded path, e.g. /bucket/key */
  path: string;
  query?: Record<string, string>;
  headers: Record<string, string>;
  payloadHash: string;
  date: Date;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Returns the Authorization header (and the x-amz-date used) for a request. */
export function signV4(i: SignInput): { authorization: string; amzDate: string } {
  const amzDate = i.date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...i.headers, host: i.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': i.payloadHash };
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const query = Object.entries(i.query ?? {})
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonicalRequest = [i.method, i.path, query, canonicalHeaders, signedHeaders, i.payloadHash].join('\n');
  const scope = `${day}/${i.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${i.secretAccessKey}`, day), i.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    amzDate,
  };
}

export function createS3(cfg: S3Config, fetchImpl: typeof fetch = fetch) {
  const base = new URL(cfg.endpoint);
  const objectPath = (key: string) => `${base.pathname.replace(/\/$/, '')}/${encode(cfg.bucket)}/${encode(key, true)}`;

  async function send(
    method: string,
    path: string,
    opts: { query?: Record<string, string>; headers?: Record<string, string>; body?: BodyInit; payloadHash?: string } = {},
  ) {
    const payloadHash = opts.payloadHash ?? sha256Hex('');
    const { authorization, amzDate } = signV4({
      method,
      host: base.host,
      path,
      query: opts.query,
      headers: opts.headers ?? {},
      payloadHash,
      date: new Date(),
      region: cfg.region,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    });
    const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : '';
    const res = await fetchImpl(`${base.origin}${path}${qs}`, {
      method,
      headers: { ...opts.headers, authorization, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash },
      body: opts.body,
      // Node needs this to stream a request body.
      ...(opts.body ? { duplex: 'half' } : {}),
    } as RequestInit);
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] ?? '';
      throw new Error(`S3 ${method} ${path} → ${res.status} ${code}`.trim());
    }
    return res;
  }

  return {
    /** Streams a local file to `key`. */
    async putFile(key: string, file: string): Promise<void> {
      const { size } = await stat(file);
      await send('PUT', objectPath(key), {
        headers: { 'content-length': String(size), 'content-type': 'application/octet-stream' },
        body: Readable.toWeb(createReadStream(file)) as unknown as BodyInit,
        payloadHash: 'UNSIGNED-PAYLOAD',
      });
    },

    /** Streams `key` into a local file. */
    async getFile(key: string, file: string): Promise<void> {
      const res = await send('GET', objectPath(key));
      if (res.status === 404 || !res.body) throw new Error(`S3 object not found: ${key}`);
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
    },

    async list(prefix: string): Promise<S3Object[]> {
      const out: S3Object[] = [];
      let token: string | undefined;
      do {
        const query: Record<string, string> = { 'list-type': '2', prefix };
        if (token) query['continuation-token'] = token;
        const xml = await (await send('GET', `${base.pathname.replace(/\/$/, '')}/${encode(cfg.bucket)}`, { query })).text();
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const part = m[1]!;
          out.push({
            key: decodeXml(/<Key>([^<]*)<\/Key>/.exec(part)?.[1] ?? ''),
            size: Number(/<Size>(\d+)<\/Size>/.exec(part)?.[1] ?? 0),
            lastModified: new Date(/<LastModified>([^<]*)<\/LastModified>/.exec(part)?.[1] ?? 0),
          });
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
          ? decodeXml(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '')
          : undefined;
      } while (token);
      return out;
    },

    async remove(key: string): Promise<void> {
      await send('DELETE', objectPath(key));
    },
  };
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export type S3Client = ReturnType<typeof createS3>;
