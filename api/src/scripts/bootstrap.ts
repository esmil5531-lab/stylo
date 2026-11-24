import { parseArgs } from 'node:util';

import { loadConfig } from '../config.js';
import { createPool, withTransaction } from '../db.js';
import { normalisePhone } from '../lib/phone.js';

/**
 * First start of a NEW production database (the dev seed never runs there):
 *  - creates the general manager (مدير عام, role super_admin) who signs in to /admin/ with this phone;
 *  - adds the default categories if there are none.
 * Safe to run again: an existing phone is (re)activated as general manager, categories are kept.
 *
 *   node dist/scripts/bootstrap.js --phone 0912345678 --name "اسم المدير"
 *   (Docker: docker compose exec app node dist/scripts/bootstrap.js --phone … --name …)
 */
const CATEGORIES: [slug: string, ar: string, en: string][] = [
  ['women', 'نساء', 'Women'],
  ['men', 'رجال', 'Men'],
  ['kids', 'أطفال', 'Kids'],
  ['bags', 'حقائب', 'Bags'],
  ['shoes', 'أحذية', 'Shoes'],
  ['accessories', 'إكسسوارات', 'Accessories'],
  ['watches', 'ساعات', 'Watches'],
];

async function main() {
  const { values } = parseArgs({ options: { phone: { type: 'string' }, name: { type: 'string' } } });
  if (!values.phone || !values.name || values.name.trim().length < 2) {
    throw new Error('Usage: bootstrap --phone 09XXXXXXXX --name "الاسم الكامل"');
  }
  const phone = normalisePhone(values.phone);
  const name = values.name.trim();
  const pool = createPool(loadConfig().database);
  try {
    await withTransaction(pool, async (db) => {
      const user = await db.query(
        `INSERT INTO users (full_name, phone, role) VALUES ($1, $2, 'admin')
         ON CONFLICT (phone) DO UPDATE SET role = 'admin'
         RETURNING id`,
        [name, phone],
      );
      const userId = user.rows[0].id as string;
      await db.query(
        `INSERT INTO staff_members (user_id, role_key, store_id, job_title, is_active)
         VALUES ($1, 'super_admin', NULL, 'المدير العام', true)
         ON CONFLICT (user_id) DO UPDATE SET role_key = 'super_admin', store_id = NULL, is_active = true`,
        [userId],
      );
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM categories`);
      if (rows[0].n === 0) {
        for (const [i, [slug, ar, en]] of CATEGORIES.entries()) {
          await db.query(`INSERT INTO categories (slug, name_ar, name_en, sort_order) VALUES ($1, $2, $3, $4)`, [
            slug,
            ar,
            en,
            i + 1,
          ]);
        }
        console.log(`✓ added ${CATEGORIES.length} categories`);
      }
    });
    console.log(`✓ general manager ${name} (${phone}) can sign in at /admin/`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
