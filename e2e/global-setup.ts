import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import pg from 'pg';

import { apiLogin, BASE, PHONES } from './helpers';

/**
 * Before the journeys:
 * - the server must answer (/health), with an up-to-date database;
 * - pending sign-in codes are cleared when the database is reachable (E2E_DATABASE_URL or
 *   DATABASE_URL), so a quick re-run does not hit «30 s between codes»;
 * - Sara (customer) and the general manager sign in once through the API: they only prepare data
 *   (orders, driver assignment); the journeys themselves sign in through the screens.
 */
export default async function globalSetup() {
  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error(`no healthy Stylo server at ${BASE} (${health?.status ?? 'not reachable'}): run npm start (and npm run db:reset)`);
  }
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://stylo:stylo@localhost:5432/stylo_dev';
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query('DELETE FROM otp_codes');
  } catch (err) {
    console.warn(`[e2e] could not clear sign-in codes (${(err as Error).message}); a re-run within 30 s may be refused`);
  } finally {
    await client.end().catch(() => {});
  }
  const sara = await apiLogin(PHONES.sara);
  const admin = await apiLogin(PHONES.superAdmin, 'admin');
  await writeFile(join(__dirname, '.tokens.json'), JSON.stringify({ sara: sara.token, admin: admin.token }));
}
