import { readFile } from 'node:fs/promises';

import { loadConfig } from '../config.js';
import { createPool } from '../db.js';

const SEED = new URL('../../../database/seeds/dev_seed.sql', import.meta.url).pathname;

async function main() {
  const config = loadConfig();
  if (config.env === 'production') throw new Error('Refusing to seed a production database');
  const pool = createPool(config.databaseUrl);
  try {
    await pool.query(await readFile(SEED, 'utf8'));
    console.log('✓ seeded development data');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
