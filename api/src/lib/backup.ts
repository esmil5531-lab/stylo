import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, open, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { createPool } from '../db.js';
import { type DatabaseConfig, resolveSslMode } from './database.js';
import { createS3, type S3Client, type S3Config } from './s3.js';

/**
 * «النسخ الاحتياطي» — one file holds BOTH the database and the uploaded photos:
 *   stylo-backup-<UTC time>.tar.gz[.enc] = manifest.json + db.dump (pg_dump custom format) + uploads.tar
 * - Consistent: the row counts in the manifest are read in the same snapshot pg_dump uses.
 * - Encrypted (AES-256-GCM, key from BACKUP_PASSPHRASE): it holds customers' phones and addresses.
 *   Off-site copies are never sent unencrypted.
 * - Kept locally (BACKUP_DIR, BACKUP_KEEP_DAYS) and copied to S3-compatible storage (Cloudflare R2,
 *   Backblaze B2…) when BACKUP_S3_* is set (BACKUP_S3_KEEP_DAYS there).
 * - `restoreBackup` puts it back (database + photos) and checks every count and checksum;
 *   `restoreTest` does that into a throw-away database: the proof a backup really restores.
 */

export const BACKUP_FILE = /^stylo-backup-(\d{8}T\d{6}Z)\.tar\.gz(\.enc)?$/;
/** Tables counted in the manifest and compared after a restore. */
export const COUNTED_TABLES = [
  'users',
  'stores',
  'products',
  'product_variants',
  'product_images',
  'orders',
  'order_items',
  'order_status_history',
  'driver_settlements',
  'payouts',
  'reviews',
  'media',
] as const;

const MAGIC = Buffer.from('STYLOBK1');
const HEADER = MAGIC.length + 16 + 12; // magic + salt + iv
const TAG = 16;

export interface BackupSettings {
  database: DatabaseConfig;
  uploadsDir: string;
  /** Photos live in Supabase Storage instead of uploadsDir (then only the database is here). */
  uploadsElsewhere: boolean;
  backupDir: string;
  keepDays: number;
  passphrase?: string;
  s3?: S3Config & { prefix: string; keepDays: number };
  /** An EMPTY database for restore tests (name must contain "test" or "restore"); else one is created. */
  testDatabaseUrl?: string;
  /** Folder with pg_dump / pg_restore when they are not on PATH (e.g. C:\Program Files\PostgreSQL\16\bin). */
  pgBin?: string;
  production: boolean;
}

export interface Manifest {
  format: 1;
  createdAt: string;
  encrypted: boolean;
  database: {
    host: string;
    name: string;
    serverVersion: string;
    lastMigration: string | null;
    /** true: counts and dump come from the same snapshot (exact comparison after restore). */
    snapshot: boolean;
    counts: Record<string, number>;
    dumpBytes: number;
    dumpSha256: string;
  };
  uploads: { storage: 'local' | 'elsewhere'; files: number; bytes: number; tarSha256: string };
}

type Log = (msg: string) => void;

// ---------------------------------------------------------------- settings

const REPO = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));

export function loadBackupSettings(
  env: NodeJS.ProcessEnv,
  base: { database: DatabaseConfig; uploadsDir: string; mediaStorage: string; production: boolean },
): BackupSettings {
  const num = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);
  const passphrase = env.BACKUP_PASSPHRASE?.trim() || undefined;
  if (passphrase && passphrase.length < 16) throw new Error('BACKUP_PASSPHRASE must be at least 16 characters');
  if (base.production && !passphrase) throw new Error('production backups need BACKUP_PASSPHRASE (they hold customer data)');
  const s3Vars = ['BACKUP_S3_ENDPOINT', 'BACKUP_S3_BUCKET', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY'];
  const s3Set = s3Vars.filter((k) => env[k]?.trim());
  if (s3Set.length > 0 && s3Set.length < s3Vars.length) {
    throw new Error(`off-site backup needs all of ${s3Vars.join(', ')}`);
  }
  if (s3Set.length && !passphrase) throw new Error('off-site backups are always encrypted: set BACKUP_PASSPHRASE');
  return {
    database: base.database,
    uploadsDir: base.uploadsDir,
    uploadsElsewhere: base.mediaStorage !== 'local',
    backupDir: env.BACKUP_DIR?.trim() || REPO('backups'),
    keepDays: num(env.BACKUP_KEEP_DAYS, 14),
    passphrase,
    s3: s3Set.length
      ? {
          endpoint: env.BACKUP_S3_ENDPOINT!.trim(),
          bucket: env.BACKUP_S3_BUCKET!.trim(),
          accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID!.trim(),
          secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY!.trim(),
          region: env.BACKUP_S3_REGION?.trim() || 'auto',
          prefix: (env.BACKUP_S3_PREFIX?.trim() ?? 'stylo/').replace(/^\/+/, ''),
          keepDays: num(env.BACKUP_S3_KEEP_DAYS, 30),
        }
      : undefined,
    testDatabaseUrl: env.BACKUP_TEST_DATABASE_URL?.trim() || undefined,
    pgBin: env.PG_BIN?.trim() || undefined,
    production: base.production,
  };
}

// ---------------------------------------------------------------- helpers

/** libpq settings for pg_dump/pg_restore: the password goes in the environment, not the command line. */
function pgToolTarget(db: DatabaseConfig, url = db.url): { uri: string; env: NodeJS.ProcessEnv } {
  const u = new URL(url);
  const env: NodeJS.ProcessEnv = { ...process.env, PGPASSWORD: decodeURIComponent(u.password) };
  u.password = '';
  // Keep only what libpq understands (e.g. Supabase adds ?pgbouncer=true).
  const keep = new Set(['sslmode', 'sslrootcert', 'connect_timeout', 'application_name', 'options']);
  for (const k of [...u.searchParams.keys()]) if (!keep.has(k)) u.searchParams.delete(k);
  if (!u.searchParams.has('sslmode') && url === db.url) {
    const mode = resolveSslMode(db);
    u.searchParams.set('sslmode', mode === 'verify' ? 'verify-full' : mode);
    if (mode === 'verify' && db.caFile) env.PGSSLROOTCERT = db.caFile;
  }
  return { uri: u.toString(), env };
}

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: env ?? process.env, windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e: NodeJS.ErrnoException) =>
      reject(
        e.code === 'ENOENT'
          ? new Error(`${basename(cmd)} not found: install the PostgreSQL client tools (same major version as the server) or set PG_BIN`)
          : e,
      ),
    );
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${basename(cmd)} failed (${code}): ${err.trim().split('\n').slice(-3).join(' | ')}`)),
    );
  });
}

const pgTool = (s: BackupSettings, name: 'pg_dump' | 'pg_restore') =>
  s.pgBin ? join(s.pgBin, process.platform === 'win32' ? `${name}.exe` : name) : name;

async function sha256File(file: string): Promise<string> {
  const h = createHash('sha256');
  await pipeline(createReadStream(file), h);
  return h.digest('hex');
}

async function walk(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { files, bytes };
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const sub = await walk(p);
      files += sub.files;
      bytes += sub.bytes;
    } else if (e.isFile()) {
      files += 1;
      bytes += (await stat(p)).size;
    }
  }
  return { files, bytes };
}

async function countRows(db: { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> }) {
  const counts: Record<string, number> = {};
  for (const t of COUNTED_TABLES) {
    const exists = (await db.query(`SELECT to_regclass('public.${t}') IS NOT NULL AS ok`)).rows[0]!.ok;
    counts[t] = exists ? Number((await db.query(`SELECT count(*) AS n FROM ${t}`)).rows[0]!.n) : 0;
  }
  const last = await db.query(
    `SELECT CASE WHEN to_regclass('public.schema_migrations') IS NULL THEN NULL
                 ELSE (SELECT max(version) FROM schema_migrations) END AS v`,
  );
  return { counts, lastMigration: (last.rows[0]!.v as string | null) ?? null };
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function sameDatabase(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname === y.hostname && (x.port || '5432') === (y.port || '5432') && x.pathname === y.pathname;
  } catch {
    return a === b;
  }
}

// ---------------------------------------------------------------- encryption

export async function encryptFile(src: string, dst: string, passphrase: string): Promise<void> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const out = createWriteStream(dst);
  out.write(Buffer.concat([MAGIC, salt, iv]));
  await pipeline(createReadStream(src), cipher, out, { end: false });
  await new Promise<void>((resolve, reject) => out.end(cipher.getAuthTag(), () => resolve()).on('error', reject));
}

export async function decryptFile(src: string, dst: string, passphrase: string): Promise<void> {
  const { size } = await stat(src);
  const fh = await open(src, 'r');
  const head = Buffer.alloc(HEADER);
  const tag = Buffer.alloc(TAG);
  try {
    await fh.read(head, 0, HEADER, 0);
    await fh.read(tag, 0, TAG, size - TAG);
  } finally {
    await fh.close();
  }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not a Stylo encrypted backup');
  const salt = head.subarray(MAGIC.length, MAGIC.length + 16);
  const iv = head.subarray(MAGIC.length + 16, HEADER);
  const key = scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(createReadStream(src, { start: HEADER, end: size - TAG - 1 }), decipher, createWriteStream(dst));
  } catch (err) {
    await rm(dst, { force: true });
    if (/authenticate/i.test((err as Error).message)) {
      throw new Error('cannot decrypt: wrong BACKUP_PASSPHRASE or a damaged file');
    }
    throw err;
  }
}

// ---------------------------------------------------------------- backup

export interface BackupResult {
  file: string;
  bytes: number;
  offsiteKey: string | null;
  manifest: Manifest;
  prunedLocal: string[];
  prunedOffsite: string[];
}

export async function createBackup(s: BackupSettings, log: Log = () => {}, now = new Date()): Promise<BackupResult> {
  await mkdir(s.backupDir, { recursive: true });
  const staging = await mkdtemp(join(tmpdir(), 'stylo-backup-'));
  const name = `stylo-backup-${stamp(now)}.tar.gz`;
  try {
    // 1. Database: counts and dump from one snapshot.
    const dumpPath = join(staging, 'db.dump');
    const pool = createPool(s.database);
    const client = await pool.connect();
    let counted: Awaited<ReturnType<typeof countRows>>;
    let serverVersion = '';
    let snapshot = true;
    const target = pgToolTarget(s.database);
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const snap = (await client.query(`SELECT pg_export_snapshot() AS id, current_setting('server_version') AS v`)).rows[0];
      serverVersion = snap.v;
      counted = await countRows(client);
      const args = ['--format=custom', '--no-owner', '--no-privileges', '--file', dumpPath, '--dbname', target.uri];
      try {
        await run(pgTool(s, 'pg_dump'), [`--snapshot=${snap.id}`, ...args], target.env);
      } catch (err) {
        // Connection poolers may refuse snapshots: dump anyway, counts become approximate.
        if (!/snapshot/i.test((err as Error).message)) throw err;
        snapshot = false;
        log('snapshot not available here: dumping without it (counts are approximate)');
        await run(pgTool(s, 'pg_dump'), args, target.env);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
      await pool.end();
    }
    await run(pgTool(s, 'pg_restore'), ['--list', dumpPath]); // the dump is readable
    log(`database dumped (${(await stat(dumpPath)).size} bytes)`);

    // 2. Photos.
    const uploadsTar = join(staging, 'uploads.tar');
    const emptyDir = join(staging, 'empty');
    await mkdir(emptyDir);
    const source = !s.uploadsElsewhere && (await walk(s.uploadsDir)).files > 0 ? s.uploadsDir : emptyDir;
    const photos = source === emptyDir ? { files: 0, bytes: 0 } : await walk(source);
    await run('tar', ['-cf', uploadsTar, '-C', source, '.']);
    log(s.uploadsElsewhere ? 'photos are in Supabase Storage: not in this file' : `photos: ${photos.files} files`);

    // 3. Manifest + one archive.
    const url = new URL(s.database.url);
    const manifest: Manifest = {
      format: 1,
      createdAt: now.toISOString(),
      encrypted: !!s.passphrase,
      database: {
        host: url.hostname,
        name: url.pathname.replace(/^\//, ''),
        serverVersion,
        lastMigration: counted.lastMigration,
        snapshot,
        counts: counted.counts,
        dumpBytes: (await stat(dumpPath)).size,
        dumpSha256: await sha256File(dumpPath),
      },
      uploads: {
        storage: s.uploadsElsewhere ? 'elsewhere' : 'local',
        files: photos.files,
        bytes: photos.bytes,
        tarSha256: await sha256File(uploadsTar),
      },
    };
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const archive = join(staging, name);
    await run('tar', ['-czf', archive, '-C', staging, 'manifest.json', 'db.dump', 'uploads.tar']);

    // 4. Encrypt and keep locally.
    const finalName = s.passphrase ? `${name}.enc` : name;
    const finalPath = join(s.backupDir, finalName);
    if (s.passphrase) await encryptFile(archive, finalPath, s.passphrase);
    else await copyFile(archive, finalPath);
    const bytes = (await stat(finalPath)).size;
    log(`saved ${finalPath} (${bytes} bytes${s.passphrase ? ', encrypted' : ', NOT encrypted'})`);

    // 5. Off-site copy.
    let offsiteKey: string | null = null;
    let prunedOffsite: string[] = [];
    if (s.s3) {
      const s3 = createS3(s.s3);
      offsiteKey = `${s.s3.prefix}${finalName}`;
      await s3.putFile(offsiteKey, finalPath);
      log(`copied off-site: ${s.s3.bucket}/${offsiteKey}`);
      prunedOffsite = await pruneOffsite(s3, s.s3.prefix, s.s3.keepDays, now);
    } else {
      log('WARNING: no off-site copy (set BACKUP_S3_*): a lost server loses its backups too');
    }

    const prunedLocal = await pruneLocal(s.backupDir, s.keepDays, now);
    const result = { file: finalPath, bytes, offsiteKey, manifest, prunedLocal, prunedOffsite };
    await writeFile(
      join(s.backupDir, 'last-backup.json'),
      JSON.stringify({ ok: true, finishedAt: new Date().toISOString(), file: finalName, bytes, offsiteKey, counts: manifest.database.counts, photos: manifest.uploads.files }, null, 2),
    );
    return result;
  } catch (err) {
    await writeFile(
      join(s.backupDir, 'last-backup.json'),
      JSON.stringify({ ok: false, finishedAt: new Date().toISOString(), error: (err as Error).message }, null, 2),
    ).catch(() => {});
    throw err;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

const fileTime = (name: string) => {
  const m = BACKUP_FILE.exec(basename(name));
  if (!m) return null;
  const t = m[1]!;
  return new Date(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`);
};

/** Deletes backups older than keepDays, always keeping the 3 newest. */
async function pruneLocal(dir: string, keepDays: number, now: Date): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => BACKUP_FILE.test(f)).sort();
  const old = files.slice(0, Math.max(0, files.length - 3)).filter((f) => now.getTime() - fileTime(f)!.getTime() > keepDays * 86_400_000);
  for (const f of old) await unlink(join(dir, f));
  return old;
}

async function pruneOffsite(s3: S3Client, prefix: string, keepDays: number, now: Date): Promise<string[]> {
  const keys = (await s3.list(prefix)).map((o) => o.key).filter((k) => BACKUP_FILE.test(basename(k))).sort();
  const old = keys.slice(0, Math.max(0, keys.length - 3)).filter((k) => now.getTime() - fileTime(k)!.getTime() > keepDays * 86_400_000);
  for (const k of old) await s3.remove(k);
  return old;
}

export async function listBackups(s: BackupSettings): Promise<{ local: string[]; offsite: string[] }> {
  let local: string[] = [];
  try {
    local = (await readdir(s.backupDir)).filter((f) => BACKUP_FILE.test(f)).sort();
  } catch {
    /* no folder yet */
  }
  const offsite = s.s3 ? (await createS3(s.s3).list(s.s3.prefix)).map((o) => o.key).filter((k) => BACKUP_FILE.test(basename(k))).sort() : [];
  return { local, offsite };
}

// ---------------------------------------------------------------- restore

export interface RestoreReport {
  ok: boolean;
  file: string;
  manifest: Manifest;
  restored: { counts: Record<string, number>; lastMigration: string | null; files: number; bytes: number };
  problems: string[];
}

/** Local path, "latest" (newest local) or "offsite:latest" / "offsite:<key>" (downloaded first). */
export async function resolveBackupFile(s: BackupSettings, which: string, workDir: string, log: Log): Promise<string> {
  if (which === 'latest' || which === 'offsite:latest' || which.startsWith('offsite:')) {
    const { local, offsite } = await listBackups(s);
    if (!which.startsWith('offsite:')) {
      if (!local.length) throw new Error(`no backup in ${s.backupDir}`);
      return join(s.backupDir, local.at(-1)!);
    }
    if (!s.s3) throw new Error('off-site storage is not configured (BACKUP_S3_*)');
    const key = which === 'offsite:latest' ? offsite.at(-1) : which.slice('offsite:'.length);
    if (!key) throw new Error('no backup in off-site storage');
    const dest = join(workDir, basename(key));
    await createS3(s.s3).getFile(key, dest);
    log(`downloaded ${key} (${(await stat(dest)).size} bytes)`);
    return dest;
  }
  return which;
}

export async function restoreBackup(
  s: BackupSettings,
  opts: { file: string; targetDatabaseUrl: string; uploadsTarget: string; replaceLive?: boolean },
  log: Log = () => {},
): Promise<RestoreReport> {
  if (sameDatabase(opts.targetDatabaseUrl, s.database.url) && !opts.replaceLive) {
    throw new Error('refusing to restore over the live database (pass --replace-live only when you mean it)');
  }
  const work = await mkdtemp(join(tmpdir(), 'stylo-restore-'));
  try {
    // 1. Decrypt + unpack, then check every checksum before touching any database.
    let archive = opts.file;
    if (opts.file.endsWith('.enc')) {
      if (!s.passphrase) throw new Error('this backup is encrypted: set BACKUP_PASSPHRASE');
      archive = join(work, 'archive.tar.gz');
      await decryptFile(opts.file, archive, s.passphrase);
    }
    await run('tar', ['-xzf', archive, '-C', work]);
    const manifest = JSON.parse(await readFile(join(work, 'manifest.json'), 'utf8')) as Manifest;
    const problems: string[] = [];
    if ((await sha256File(join(work, 'db.dump'))) !== manifest.database.dumpSha256) problems.push('db.dump checksum differs');
    if ((await sha256File(join(work, 'uploads.tar'))) !== manifest.uploads.tarSha256) problems.push('uploads.tar checksum differs');
    if (problems.length) throw new Error(`damaged backup: ${problems.join(', ')}`);
    log(`backup of ${manifest.createdAt} is intact (checksums match)`);

    // 2. Database.
    const target = pgToolTarget({ url: opts.targetDatabaseUrl }, opts.targetDatabaseUrl);
    const args = ['--no-owner', '--no-privileges', '--exit-on-error', '--dbname', target.uri];
    if (opts.replaceLive) args.unshift('--clean', '--if-exists');
    await run(pgTool(s, 'pg_restore'), [...args, join(work, 'db.dump')], target.env);
    log('database restored');

    // 3. Photos.
    await mkdir(opts.uploadsTarget, { recursive: true });
    await run('tar', ['-xf', join(work, 'uploads.tar'), '-C', opts.uploadsTarget]);
    const files = await walk(opts.uploadsTarget);
    log(`photos restored: ${files.files} files`);

    // 4. Compare with the manifest.
    const pool = createPool({ url: opts.targetDatabaseUrl });
    let restored;
    try {
      restored = await countRows(pool);
    } finally {
      await pool.end();
    }
    for (const t of COUNTED_TABLES) {
      const want = manifest.database.counts[t] ?? 0;
      const got = restored.counts[t] ?? 0;
      if (manifest.database.snapshot ? got !== want : got < want) problems.push(`${t}: ${got} rows, backup says ${want}`);
    }
    if (restored.lastMigration !== manifest.database.lastMigration) {
      problems.push(`last migration ${restored.lastMigration}, backup says ${manifest.database.lastMigration}`);
    }
    if (files.files !== manifest.uploads.files || files.bytes !== manifest.uploads.bytes) {
      problems.push(`photos: ${files.files} files / ${files.bytes} bytes, backup says ${manifest.uploads.files} / ${manifest.uploads.bytes}`);
    }
    return {
      ok: problems.length === 0,
      file: opts.file,
      manifest,
      restored: { ...restored, files: files.files, bytes: files.bytes },
      problems,
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * «تجربة الاستعادة»: restores a backup into a throw-away database and folder, compares everything
 * with the manifest, then removes them. Uses BACKUP_TEST_DATABASE_URL (an empty database whose
 * name contains "test" or "restore"; it is wiped) or creates `<db>_restore_test` (needs CREATEDB).
 */
export async function restoreTest(s: BackupSettings, which = 'latest', log: Log = () => {}): Promise<RestoreReport> {
  const work = await mkdtemp(join(tmpdir(), 'stylo-restore-test-'));
  const live = new URL(s.database.url);
  let testUrl: string;
  let created: string | null = null;
  if (s.testDatabaseUrl) {
    const name = new URL(s.testDatabaseUrl).pathname.slice(1);
    if (sameDatabase(s.testDatabaseUrl, s.database.url) || !/test|restore/i.test(name)) {
      throw new Error('BACKUP_TEST_DATABASE_URL must be a separate database whose name contains "test" or "restore"');
    }
    testUrl = s.testDatabaseUrl;
    const pool = createPool({ url: testUrl });
    try {
      await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    } finally {
      await pool.end();
    }
  } else {
    created = `${live.pathname.slice(1)}_restore_test`.replace(/[^a-zA-Z0-9_]/g, '_');
    const admin = createPool(s.database);
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${created}"`);
      await admin.query(`CREATE DATABASE "${created}"`);
    } catch (err) {
      throw new Error(
        `cannot create a test database (${(err as Error).message}): set BACKUP_TEST_DATABASE_URL to an empty database instead`,
      );
    } finally {
      await admin.end();
    }
    const u = new URL(s.database.url);
    u.pathname = `/${created}`;
    testUrl = u.toString();
  }
  try {
    const file = await resolveBackupFile(s, which, work, log);
    const report = await restoreBackup(
      { ...s, database: { ...s.database } },
      { file, targetDatabaseUrl: testUrl, uploadsTarget: join(work, 'uploads') },
      log,
    );
    await mkdir(s.backupDir, { recursive: true });
    await writeFile(
      join(s.backupDir, 'last-restore-test.json'),
      JSON.stringify(
        { ok: report.ok, testedAt: new Date().toISOString(), backup: basename(file), backupCreatedAt: report.manifest.createdAt, counts: report.restored.counts, photos: report.restored.files, problems: report.problems },
        null,
        2,
      ),
    );
    return report;
  } finally {
    await rm(work, { recursive: true, force: true });
    if (created) {
      const admin = createPool(s.database);
      await admin.query(`DROP DATABASE IF EXISTS "${created}" WITH (FORCE)`).catch(() => {});
      await admin.end();
    } else {
      const pool = createPool({ url: testUrl });
      await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;').catch(() => {});
      await pool.end();
    }
  }
}
