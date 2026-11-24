import { readFileSync } from 'node:fs';

import type pg from 'pg';

/**
 * How we connect to PostgreSQL — local, Docker, or a cloud host such as Supabase.
 *
 * SSL is decided here, not by `sslmode` in the URL: pg ≥ 8.13 treats `sslmode=require` as full
 * certificate verification, which fails on Supabase's own CA ("self-signed certificate in
 * certificate chain"). DATABASE_SSL:
 *   - disable    plain connection (local PostgreSQL, Docker network)
 *   - require    encrypted, certificate not verified (Supabase without the CA file)
 *   - verify     encrypted and verified; with DATABASE_CA_FILE for a private CA (Supabase's
 *                "SSL certificate" download in Dashboard → Database settings)
 *   - (unset)    auto: local hosts → disable; known cloud hosts (Supabase, Neon…) → verify when
 *                DATABASE_CA_FILE is set, else require; otherwise follow `sslmode` in the URL.
 */
export type DbSslMode = 'disable' | 'require' | 'verify';

export interface DatabaseConfig {
  url: string;
  ssl?: DbSslMode;
  caFile?: string;
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|db|postgres|host\.docker\.internal)$/i;
const CLOUD_HOST = /(\.supabase\.(co|com)|\.neon\.tech|\.render\.com|\.rds\.amazonaws\.com)$/i;

export function databaseHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** The connection URL without its password (for logs). */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return '(invalid DATABASE_URL)';
  }
}

export function resolveSslMode(cfg: DatabaseConfig): DbSslMode {
  if (cfg.ssl) return cfg.ssl;
  const host = databaseHost(cfg.url);
  if (LOCAL_HOST.test(host)) return 'disable';
  if (CLOUD_HOST.test(host)) return cfg.caFile ? 'verify' : 'require';
  let sslmode: string | null = null;
  try {
    sslmode = new URL(cfg.url).searchParams.get('sslmode');
  } catch {
    /* invalid URL: pg reports it */
  }
  if (!sslmode || sslmode === 'disable' || sslmode === 'allow' || sslmode === 'prefer') return 'disable';
  return sslmode.startsWith('verify') ? 'verify' : 'require';
}

/** pg.Pool options for this database: SSL handled here, `ssl*` URL parameters removed. */
export function poolOptions(cfg: DatabaseConfig): pg.PoolConfig {
  let connectionString = cfg.url;
  try {
    const u = new URL(cfg.url);
    for (const p of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) u.searchParams.delete(p);
    connectionString = u.toString();
  } catch {
    /* leave as is */
  }
  const mode = resolveSslMode(cfg);
  const ssl: pg.PoolConfig['ssl'] =
    mode === 'disable'
      ? false
      : mode === 'require'
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true, ...(cfg.caFile ? { ca: readFileSync(cfg.caFile, 'utf8') } : {}) };
  return { connectionString, ssl, max: 10, connectionTimeoutMillis: 10_000 };
}

export interface DbProblem {
  /** Stable code for the client and logs. */
  code: string;
  /** Short Arabic explanation for the developer (shown in development only). */
  hintAr: string;
  /** Detailed English hint for the server log. */
  hint: string;
}

const SUPABASE_DIRECT = /^db\.[a-z0-9]+\.supabase\.co$/i;

/**
 * Turns a connection failure into the likely cause and the fix. Returns null for errors that
 * are not about reaching the database (SQL errors etc.).
 */
export function diagnoseDbError(err: unknown, url: string): DbProblem | null {
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? '';
  const msg = e?.message ?? '';
  const host = databaseHost(url);

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    if (SUPABASE_DIRECT.test(host)) {
      return {
        code: 'db_host_not_found',
        hintAr:
          'عنوان Supabase المباشر (db.…supabase.co) يعمل على IPv6 فقط. استخدمي رابط «Session pooler» من Supabase (Connect) في DATABASE_URL، أو تأكدي أن المشروع غير متوقف (Paused).',
        hint:
          `Cannot resolve ${host}. Supabase direct connections are IPv6-only and most networks (and Windows) cannot reach them. ` +
          'Use the Session pooler URL instead: Supabase Dashboard → Connect → Session pooler, e.g. ' +
          'postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres . ' +
          'Also check the project is not paused (Dashboard → Restore project).',
      };
    }
    return {
      code: 'db_host_not_found',
      hintAr: `لا يمكن العثور على خادم قاعدة البيانات «${host}». تحققي من DATABASE_URL ومن الاتصال بالإنترنت.`,
      hint: `Cannot resolve the database host "${host}". Check DATABASE_URL and the network/DNS.`,
    };
  }
  if (code === 'ECONNREFUSED') {
    return {
      code: 'db_refused',
      hintAr: `قاعدة البيانات لا تقبل الاتصال على ${host}. هل PostgreSQL يعمل؟ (Windows: خدمة postgresql في Services)`,
      hint: `Connection refused by ${host}. Is PostgreSQL running and listening on that port?`,
    };
  }
  if (code === 'ETIMEDOUT' || code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || /timeout/i.test(msg)) {
    return {
      code: 'db_timeout',
      hintAr: 'انتهت مهلة الاتصال بقاعدة البيانات. تحققي من الإنترنت أو جدار الحماية، أو استخدمي رابط Session pooler من Supabase.',
      hint: `Timed out reaching ${host}. A firewall or missing IPv6 route? For Supabase use the Session pooler URL.`,
    };
  }
  if (code === '28P01' || /password authentication failed/i.test(msg)) {
    return {
      code: 'db_bad_password',
      hintAr: 'كلمة مرور قاعدة البيانات خاطئة في DATABASE_URL. في Supabase: Database settings → Reset database password.',
      hint: 'Password authentication failed. Fix the password in DATABASE_URL (special characters must be URL-encoded).',
    };
  }
  if (/tenant or user not found/i.test(msg)) {
    return {
      code: 'db_bad_user',
      hintAr: 'اسم المستخدم في رابط Supabase pooler يجب أن يكون postgres.<project-ref> وليس postgres فقط، والمنطقة (region) صحيحة.',
      hint: 'Supabase pooler: the user must be "postgres.<project-ref>" and the pooler host must match the project region.',
    };
  }
  if (code === '3D000') {
    return {
      code: 'db_missing',
      hintAr: 'قاعدة البيانات المذكورة في DATABASE_URL غير موجودة.',
      hint: 'The database in DATABASE_URL does not exist. Create it (local) or use "postgres" (Supabase).',
    };
  }
  if (/self[- ]signed certificate|unable to verify|certificate/i.test(msg) || code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    return {
      code: 'db_ssl',
      hintAr: 'مشكلة في شهادة SSL. ضعي DATABASE_SSL=require في api/.env، أو DATABASE_CA_FILE لملف شهادة Supabase.',
      hint: 'SSL certificate rejected. Set DATABASE_SSL=require, or DATABASE_SSL=verify with DATABASE_CA_FILE=<Supabase CA .crt>.',
    };
  }
  if (/does not support SSL|SSL off|no pg_hba\.conf entry.*SSL/i.test(msg)) {
    return {
      code: 'db_ssl',
      hintAr: 'إعداد SSL لا يناسب خادم قاعدة البيانات. جرّبي DATABASE_SSL=disable (محلياً) أو require (سحابياً).',
      hint: 'SSL mismatch with the server: try DATABASE_SSL=disable (local) or require (cloud).',
    };
  }
  if (code === '42P01' && /relation .* does not exist/i.test(msg)) {
    return {
      code: 'db_not_migrated',
      hintAr: 'جداول قاعدة البيانات غير موجودة. شغّلي npm run db:reset (أو db:migrate) أولاً.',
      hint: 'Tables are missing: run `npm run db:reset` (or `npm run db:migrate`).',
    };
  }
  return null;
}
