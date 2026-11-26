/**
 * «حماية البيانات»: daily clean-up of expired data, the S3 signature (AWS's published example),
 * backup encryption, and a full backup → restore-test round trip (database + photos).
 * Needs pg_dump/pg_restore of the server's major version and a database `stylo_restore_test`
 * (created here when the role may; CI runs as superuser).
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createPool, type Pool } from '../src/db.js';
import {
  createBackup,
  decryptFile,
  encryptFile,
  restoreBackup,
  restoreTest,
  type BackupSettings,
} from '../src/lib/backup.js';
import { signV4 } from '../src/lib/s3.js';
import { purgeExpiredData } from '../src/modules/maintenance/cleanup.js';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_test';
const RESTORE_DB = (() => {
  const u = new URL(TEST_DB);
  u.pathname = '/stylo_restore_test';
  return u.toString();
})();
const ROOT = fileURLToPath(new URL('../../database/', import.meta.url));

let pool: Pool;
const tmp = mkdtempSync(join(tmpdir(), 'stylo-backup-test-'));

before(async () => {
  pool = createPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const files = (await readdir(`${ROOT}migrations`)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await pool.query(await readFile(`${ROOT}migrations/${f}`, 'utf8'));
  await pool.query(await readFile(`${ROOT}seeds/dev_seed.sql`, 'utf8'));
  // Like a real database: migrations tracked (npm run db:migrate).
  await pool.query(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`INSERT INTO schema_migrations (version) SELECT unnest($1::text[])`, [files.map((f) => f.replace(/\.sql$/, ''))]);
  // The throw-away restore database (CI: superuser; locally create it once as postgres).
  const exists = (await pool.query(`SELECT 1 FROM pg_database WHERE datname = 'stylo_restore_test'`)).rowCount;
  if (!exists) {
    await pool.query('CREATE DATABASE stylo_restore_test').catch((err: unknown) => {
      throw new Error(`create the database stylo_restore_test first (${String(err)})`);
    });
  }
});

after(async () => {
  await pool?.end();
});

describe('daily clean-up', () => {
  it('removes only what has expired (codes, sessions, shared carts, old message log)', async () => {
    const now = new Date();
    const user = '00000000-0000-0000-0000-000000000004';
    await pool.query(`DELETE FROM otp_codes; DELETE FROM message_log;`);
    await pool.query(
      `INSERT INTO otp_codes (phone, code_hash, expires_at, created_at) VALUES
         ('+218910000004', 'old', now() - interval '3 days', now() - interval '3 days'),
         ('+218910000004', 'new', now() + interval '5 minutes', now())`,
    );
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, app, expires_at, revoked_at) VALUES
         ($1, 'expired-long-ago', 'customer', now() - interval '30 days', NULL),
         ($1, 'revoked-long-ago', 'customer', now() + interval '1 day', now() - interval '10 days'),
         ($1, 'still-valid', 'customer', now() + interval '1 day', NULL)`,
      [user],
    );
    await pool.query(
      `UPDATE sessions SET refresh_expires_at = now() + interval '100 days' WHERE token_hash = 'expired-long-ago'`,
    );
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, app, expires_at, refresh_expires_at) VALUES
         ($1, 'refresh-gone', 'customer', now() - interval '60 days', now() - interval '20 days')`,
      [user],
    );
    const store = (await pool.query(`SELECT id FROM stores LIMIT 1`)).rows[0].id;
    await pool.query(
      `INSERT INTO shared_carts (token, owner_id, store_id, expires_at) VALUES
         ('oldshare0001', $1, $2, now() - interval '10 days'), ('newshare0001', $1, $2, now() + interval '10 days')`,
      [user, store],
    );
    await pool.query(
      `INSERT INTO message_log (channel, purpose, to_phone, status, created_at) VALUES
         ('console', 'otp', '+218910000004', 'sent', now() - interval '200 days'),
         ('console', 'otp', '+218910000004', 'sent', now() - interval '5 days')`,
    );

    const r = await purgeExpiredData(pool, now, { messageLogDays: 180 });
    assert.equal(r.otpCodes, 1);
    assert.equal(r.sharedCarts, 1);
    assert.equal(r.messageLog, 1);
    const left = (await pool.query(`SELECT token_hash FROM sessions WHERE token_hash IN ('expired-long-ago','revoked-long-ago','still-valid','refresh-gone')`)).rows.map((x) => x.token_hash).sort();
    // An expired access token with a live refresh token is kept: the app renews it.
    assert.deepEqual(left, ['expired-long-ago', 'still-valid']);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM otp_codes`)).rows[0].n, 1);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM shared_carts WHERE token = 'newshare0001'`)).rows[0].n, 1);
  });
});

describe('S3 signature (AWS Signature V4)', () => {
  it("matches AWS's published GET Object example", () => {
    const { authorization } = signV4({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      headers: { range: 'bytes=0-9' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      date: new Date('2013-05-24T00:00:00Z'),
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    });
    assert.equal(
      authorization,
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });
});

describe('encryption', () => {
  it('round-trips, and refuses a wrong passphrase or a modified byte', async () => {
    const plain = join(tmp, 'plain.bin');
    writeFileSync(plain, Buffer.alloc(300_000, 7));
    await encryptFile(plain, join(tmp, 'x.enc'), 'correct horse battery staple');
    assert.notDeepEqual(readFileSync(join(tmp, 'x.enc')).subarray(40, 80), readFileSync(plain).subarray(0, 40));
    await decryptFile(join(tmp, 'x.enc'), join(tmp, 'back.bin'), 'correct horse battery staple');
    assert.deepEqual(readFileSync(join(tmp, 'back.bin')), readFileSync(plain));
    await assert.rejects(decryptFile(join(tmp, 'x.enc'), join(tmp, 'bad.bin'), 'wrong passphrase 1234'), /cannot decrypt/);
    const tampered = readFileSync(join(tmp, 'x.enc'));
    tampered[1000] = tampered[1000]! ^ 1;
    writeFileSync(join(tmp, 't.enc'), tampered);
    await assert.rejects(decryptFile(join(tmp, 't.enc'), join(tmp, 'bad2.bin'), 'correct horse battery staple'), /cannot decrypt/);
  });
});

describe('backup → restore (database + photos)', () => {
  let settings: BackupSettings;

  before(() => {
    const uploads = join(tmp, 'uploads');
    mkdirSync(join(uploads, 'product/2026/11'), { recursive: true });
    writeFileSync(join(uploads, 'product/2026/11/a-800.webp'), Buffer.alloc(1234, 1));
    writeFileSync(join(uploads, 'product/2026/11/a-1600.webp'), Buffer.alloc(4321, 2));
    settings = {
      database: { url: TEST_DB },
      uploadsDir: uploads,
      uploadsElsewhere: false,
      backupDir: join(tmp, 'backups'),
      keepDays: 14,
      passphrase: 'a-long-test-passphrase-123',
      testDatabaseUrl: RESTORE_DB,
      // CI points this at the server's version (several client versions may be installed).
      pgBin: process.env.PG_BIN,
      production: false,
    };
  });

  it('one encrypted file with the database and the photos; the restore test finds everything', async () => {
    const r = await createBackup(settings);
    assert.match(r.file, /stylo-backup-\d{8}T\d{6}Z\.tar\.gz\.enc$/);
    assert.equal(r.manifest.uploads.files, 2);
    assert.equal(r.manifest.uploads.bytes, 1234 + 4321);
    assert.equal(r.manifest.database.snapshot, true);
    const orders = (await pool.query(`SELECT count(*)::int AS n FROM orders`)).rows[0].n;
    assert.equal(r.manifest.database.counts.orders, orders);
    assert.equal(r.manifest.database.lastMigration, (await pool.query(`SELECT max(version) AS v FROM schema_migrations`)).rows[0].v);
    // Customer data never sits in clear text: the file does not contain a seeded phone number.
    assert.ok(!readFileSync(r.file).includes(Buffer.from('+218910000004')));

    const report = await restoreTest(settings, 'latest');
    assert.equal(report.ok, true, report.problems.join('; '));
    assert.equal(report.restored.counts.orders, orders);
    assert.equal(report.restored.files, 2);
    const status = JSON.parse(await readFile(join(settings.backupDir, 'last-restore-test.json'), 'utf8'));
    assert.equal(status.ok, true);
  });

  it('refuses to restore over the live database unless told to', async () => {
    const latest = (await readdir(settings.backupDir)).filter((f) => f.endsWith('.enc')).sort().at(-1)!;
    await assert.rejects(
      restoreBackup(settings, { file: join(settings.backupDir, latest), targetDatabaseUrl: TEST_DB, uploadsTarget: join(tmp, 'x') }),
      /refusing to restore over the live database/,
    );
  });

  it('a damaged backup is refused before any database is touched', async () => {
    const latest = (await readdir(settings.backupDir)).filter((f) => f.endsWith('.enc')).sort().at(-1)!;
    const bytes = readFileSync(join(settings.backupDir, latest));
    bytes[bytes.length - 100] = bytes[bytes.length - 100]! ^ 0xff;
    await writeFile(join(tmp, 'damaged.tar.gz.enc'), bytes);
    await assert.rejects(restoreTest(settings, join(tmp, 'damaged.tar.gz.enc')), /cannot decrypt/);
  });
});
