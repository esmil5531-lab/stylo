/**
 * Connecting to PostgreSQL anywhere (local, Docker, Supabase): SSL choice, and clear errors when
 * the database cannot be reached instead of «حدث خطأ غير متوقع».
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { diagnoseDbError, poolOptions, redactUrl, resolveSslMode } from '../src/lib/database.js';

const POOLER = 'postgresql://postgres.abcdefghijklmnop:pa%24s@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';
const DIRECT = 'postgresql://postgres:pass@db.whzoysxezmpredwnjjiw.supabase.co:5432/postgres';

describe('SSL per host', () => {
  it('local and Docker hosts: no SSL; Supabase: encrypted (verified only with its CA file)', () => {
    assert.equal(resolveSslMode({ url: 'postgresql://stylo:stylo@localhost:5432/stylo_dev' }), 'disable');
    assert.equal(resolveSslMode({ url: 'postgresql://stylo:x@db:5432/stylo' }), 'disable');
    assert.equal(resolveSslMode({ url: POOLER }), 'require');
    assert.equal(resolveSslMode({ url: POOLER, caFile: '/etc/ssl/supabase.crt' }), 'verify');
    assert.equal(resolveSslMode({ url: 'postgresql://u:p@example.org/db?sslmode=require' }), 'require');
    assert.equal(resolveSslMode({ url: 'postgresql://u:p@example.org/db?sslmode=verify-full' }), 'verify');
    assert.equal(resolveSslMode({ url: POOLER, ssl: 'disable' }), 'disable');
  });

  it('sslmode in the URL is removed (pg would turn require into strict verification)', () => {
    const o = poolOptions({ url: `${POOLER}?sslmode=require` });
    assert.ok(!String(o.connectionString).includes('sslmode'));
    assert.deepEqual(o.ssl, { rejectUnauthorized: false });
    assert.equal(poolOptions({ url: 'postgresql://a:b@localhost/x' }).ssl, false);
  });

  it('logs never show the password', () => {
    assert.ok(!redactUrl(POOLER).includes('pa%24s'));
    assert.ok(redactUrl(POOLER).includes('****'));
  });
});

describe('diagnosing connection failures', () => {
  it('Supabase direct (IPv6-only) host → use the Session pooler', () => {
    const p = diagnoseDbError(Object.assign(new Error('getaddrinfo ENOTFOUND x'), { code: 'ENOTFOUND' }), DIRECT)!;
    assert.equal(p.code, 'db_host_not_found');
    assert.match(p.hint, /Session pooler/);
    assert.match(p.hintAr, /Session pooler/);
  });

  it('password, pooler user, SSL, missing tables, refused', () => {
    const d = (e: object) => diagnoseDbError(Object.assign(new Error((e as { message?: string }).message ?? ''), e), POOLER)?.code;
    assert.equal(d({ code: '28P01', message: 'password authentication failed for user "postgres"' }), 'db_bad_password');
    assert.equal(d({ code: 'XX000', message: 'Tenant or user not found' }), 'db_bad_user');
    assert.equal(d({ code: 'SELF_SIGNED_CERT_IN_CHAIN', message: 'self-signed certificate in certificate chain' }), 'db_ssl');
    assert.equal(d({ code: '42P01', message: 'relation "categories" does not exist' }), 'db_not_migrated');
    assert.equal(d({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }), 'db_refused');
    assert.equal(d({ code: '23505', message: 'duplicate key value' }), undefined);
  });

  it('the API answers 503 database_unavailable with the fix (not 500 «خطأ غير متوقع»)', async () => {
    const url = 'postgresql://stylo:stylo@127.0.0.1:1/nothing'; // nothing listens on port 1
    const pool = createPool(url);
    const app = await buildApp({ pool, config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: url }), logger: false });
    try {
      const res = await app.inject('/v1/categories');
      assert.equal(res.statusCode, 503);
      assert.equal(res.json().error.code, 'database_unavailable');
      assert.match(res.json().error.message, /قاعدة البيانات/);
      const otp = await app.inject({ method: 'POST', url: '/v1/auth/otp/request', payload: { phone: '0913699762' } });
      assert.equal(otp.statusCode, 503);
      const health = await app.inject('/health');
      assert.equal(health.statusCode, 503);
      assert.equal(health.json().database, 'db_refused');
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
