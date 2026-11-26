/**
 * «النسخ الاحتياطي» from the command line (see lib/backup.ts and docs/BACKUP.md):
 *   npm run backup                                  → database + photos → one encrypted file (+ off-site copy)
 *   npm run backup -- list                          → backups here and off-site
 *   npm run backup:test                             → restore the newest into a throw-away database and check it
 *   npm run backup:test -- offsite:latest           → same, downloaded from off-site storage
 *   npm run backup -- restore <file|latest|offsite:latest> --to <database url> --uploads <folder> [--replace-live]
 *   node dist/scripts/backup.js daemon              → Docker service: daily backup, weekly restore test
 */
import { loadConfig } from '../config.js';
import {
  createBackup,
  listBackups,
  loadBackupSettings,
  resolveBackupFile,
  restoreBackup,
  restoreTest,
  type BackupSettings,
  type RestoreReport,
} from '../lib/backup.js';

const log = (msg: string) => console.log(`[backup] ${msg}`);

function settings(): BackupSettings {
  const config = loadConfig();
  return loadBackupSettings(process.env, {
    database: config.database,
    uploadsDir: config.media.localDir,
    mediaStorage: config.media.driver,
    production: config.env === 'production',
  });
}

function printReport(r: RestoreReport) {
  const c = r.restored.counts;
  console.log(
    `  orders ${c.orders} · products ${c.products} · users ${c.users} · photos ${r.restored.files} files · migration ${r.restored.lastMigration}`,
  );
  if (r.ok) console.log('✓ restore OK — the backup is complete and restorable (الاستعادة ناجحة والنسخة سليمة)');
  else {
    console.log('✗ restore found problems (الاستعادة فيها مشاكل):');
    for (const p of r.problems) console.log(`  - ${p}`);
  }
}

async function backup(s: BackupSettings) {
  const r = await createBackup(s, log);
  const c = r.manifest.database.counts;
  console.log(
    `✓ backup done (تمت النسخة): ${r.file}\n  ${r.bytes} bytes · orders ${c.orders} · products ${c.products} · photos ${r.manifest.uploads.files}` +
      (r.offsiteKey ? `\n  off-site: ${r.offsiteKey}` : '\n  ⚠ no off-site copy (لا توجد نسخة خارج الخادم): set BACKUP_S3_*'),
  );
}

/** Next run at `hour` o'clock Libya time (UTC+2 all year). */
function nextRunAt(hour: number, from = new Date()): Date {
  const next = new Date(from);
  next.setUTCHours((hour - 2 + 24) % 24, 0, 0, 0);
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

async function daemon(s: BackupSettings) {
  const hour = Number(process.env.BACKUP_HOUR ?? 3);
  const testDay = Number(process.env.BACKUP_TEST_WEEKDAY ?? 5); // Friday
  log(`daily backup at ${hour}:00 Libya time; restore test every week (day ${testDay})`);
  for (;;) {
    const at = nextRunAt(hour);
    log(`next backup ${at.toISOString()}`);
    await new Promise((r) => setTimeout(r, at.getTime() - Date.now()));
    try {
      await backup(s);
      const libyaDay = new Date(Date.now() + 2 * 3_600_000).getUTCDay();
      if (libyaDay === testDay) printReport(await restoreTest(s, s.s3 ? 'offsite:latest' : 'latest', log));
    } catch (err) {
      console.error(`✗ backup failed (فشلت النسخة): ${(err as Error).message}`);
    }
  }
}

async function main() {
  const [command = 'backup', ...rest] = process.argv.slice(2);
  const s = settings();
  const flag = (name: string) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  switch (command) {
    case 'backup':
      return backup(s);
    case 'list': {
      const { local, offsite } = await listBackups(s);
      console.log(`local (${s.backupDir}):\n${local.map((f) => `  ${f}`).join('\n') || '  —'}`);
      console.log(`off-site:\n${offsite.map((f) => `  ${f}`).join('\n') || (s.s3 ? '  —' : '  (not configured)')}`);
      return;
    }
    case 'restore-test': {
      const report = await restoreTest(s, rest[0] ?? 'latest', log);
      printReport(report);
      if (!report.ok) process.exitCode = 1;
      return;
    }
    case 'restore': {
      const which = rest[0];
      const to = flag('--to');
      const uploads = flag('--uploads');
      if (!which || !to || !uploads) {
        throw new Error('usage: restore <file|latest|offsite:latest> --to <database url> --uploads <folder> [--replace-live]');
      }
      const file = await resolveBackupFile(s, which, s.backupDir, log);
      const report = await restoreBackup(s, { file, targetDatabaseUrl: to, uploadsTarget: uploads, replaceLive: rest.includes('--replace-live') }, log);
      printReport(report);
      if (!report.ok) process.exitCode = 1;
      return;
    }
    case 'daemon':
      return daemon(s);
    default:
      throw new Error(`unknown command "${command}" (backup | list | restore | restore-test | daemon)`);
  }
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
});
