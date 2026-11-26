# النسخ الاحتياطي والاستعادة — ستايلو

## ما الذي يُنسخ

كل ليلة الساعة 3:00 بتوقيت ليبيا، تنشئ خدمة `backup` **ملفاً واحداً** يحتوي:

- **قاعدة البيانات كاملة**، عبر `pg_dump`: الطلبات والمتاجر والمنتجات والحسابات والعُهدة والتحويلات.
- **كل الصور المرفوعة** من اللوحة (وحدة التخزين `uploads`).
- **ملف `manifest.json`** فيه أعداد الصفوف وبصمة SHA-256 لكل جزء. تُستخدم هذه الأرقام للتحقق بعد أي استعادة.

الملف **مشفّر** (AES-256-GCM) بكلمة سر `BACKUP_PASSPHRASE`، لأنه يحتوي أرقام هواتف الزبائن وعناوينهم. لا يمكن فتحه بدون كلمة السر، ولا تُرسل أي نسخة خارج الخادم بدون تشفير.

| أين | المدة |
|---|---|
| على الخادم: `deploy/backups/` | 14 يوماً (`BACKUP_KEEP_DAYS`) |
| خارج الخادم: Cloudflare R2 أو Backblaze B2 أو أي خدمة متوافقة مع S3 | 30 يوماً (`BACKUP_S3_KEEP_DAYS`) |

أحدث 3 نسخ تبقى دائماً، مهما كان عمرها.

**تجربة الاستعادة تعمل تلقائياً كل جمعة.** تأخذ الخدمة أحدث نسخة من التخزين الخارجي، وتستعيدها في قاعدة مؤقتة، وتقارن كل الأعداد والصور مع `manifest.json`، ثم تحذف القاعدة المؤقتة.

نتيجة آخر نسخة وآخر تجربة تجدها في:
- `deploy/backups/last-backup.json`
- `deploy/backups/last-restore-test.json`

## الإعداد مرة واحدة (Cloudflare R2: مجاني حتى 10 جيجابايت)

1. سجّل في Cloudflare ← **R2 Object Storage** ← **Create bucket**، وسمّه `stylo-backups`.
2. افتح **R2 ← Manage R2 API Tokens ← Create API Token**:
   - الصلاحية: **Object Read & Write**.
   - النطاق: هذا الـ bucket فقط.
   - انسخ **Access Key ID** و **Secret Access Key**، ورابط **S3 API** وشكله `https://<account-id>.r2.cloudflarestorage.com`.
3. أنشئ كلمة سر قوية للتشفير:
   ```bash
   openssl rand -hex 24
   ```
   **احفظها خارج الخادم**، في مدير كلمات سر أو ورقة في مكان آمن. إن ضاعت فلا يمكن فتح أي نسخة.
4. في `deploy/.env.production`:
   ```
   BACKUP_PASSPHRASE=<كلمة السر>
   BACKUP_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   BACKUP_S3_BUCKET=stylo-backups
   BACKUP_S3_ACCESS_KEY_ID=<...>
   BACKUP_S3_SECRET_ACCESS_KEY=<...>
   ```
5. شغّل الخدمة:
   ```bash
   docker compose up -d --build backup
   ```

## أوامر على الخادم (من داخل `deploy/`)

```bash
docker compose run --rm backup node dist/scripts/backup.js backup          # نسخة الآن
docker compose run --rm backup node dist/scripts/backup.js list            # النسخ هنا وخارج الخادم
docker compose run --rm backup node dist/scripts/backup.js restore-test offsite:latest   # تجربة استعادة الآن
docker compose logs --tail 50 backup                                       # سجل الخدمة
```

## الاستعادة بعد كارثة (الخادم ضاع أو البيانات تلفت)

1. جهّز خادماً جديداً كما في `docs/DEPLOY.md`، وضع **نفس** `.env.production`، وفيه نفس `BACKUP_PASSPHRASE` ومفاتيح R2.
2. شغّل قاعدة البيانات فقط:
   ```bash
   docker compose up -d db
   ```
3. استعد أحدث نسخة من التخزين الخارجي إلى قاعدة البيانات وإلى وحدة الصور:
   ```bash
   docker compose run --rm -v stylo_uploads:/restore-uploads backup \
     node dist/scripts/backup.js restore offsite:latest \
     --to "postgresql://stylo:<POSTGRES_PASSWORD>@db:5432/stylo" --uploads /restore-uploads --replace-live
   ```
   يجب أن ينتهي بالسطر «✓ restore OK».
4. شغّل الباقي:
   ```bash
   docker compose up -d
   ```
5. افحص الموقع:
   ```bash
   npm run check:site -- https://<النطاق>
   ```

**لاستعادة نسخة قديمة بدل الأحدث:** اعرضها بأمر `list`، ثم استخدم `offsite:stylo/stylo-backup-<الوقت>.tar.gz.enc` بدل `offsite:latest`.

**قبل أي استعادة فوق قاعدة تعمل:** أوقف التطبيق أولاً (`docker compose stop app`). الأداة نفسها ترفض الاستعادة فوق القاعدة الحية بدون `--replace-live`.

## على جهازك (Windows أو التطوير)

```bash
npm run backup                  # نسخة من قاعدة التطوير + مجلد uploads إلى backups/
npm run backup:test             # تجربة استعادة أحدث نسخة
npm run backup -- list
```

**المتطلبات:**
- أدوات PostgreSQL بنفس رقم إصدار الخادم الرئيسي، أي `pg_dump` و `pg_restore` الإصدار 16.
  - هذه الأدوات تُثبَّت مع PostgreSQL على Windows. إن لم تكن في الـ PATH، ضع مكانها في `api\.env`، مثل `PG_BIN=C:\Program Files\PostgreSQL\16\bin`.
- لتجربة الاستعادة: قاعدة فارغة اسمها يحتوي `test` أو `restore`، تحددها في `BACKUP_TEST_DATABASE_URL`، مثل `postgresql://stylo:stylo@localhost:5432/stylo_restore_test`. **تُمسح محتوياتها في كل تجربة.**
  - بدون هذا الإعداد، تحاول الأداة إنشاء `<اسم القاعدة>_restore_test` بنفسها، وهذا يحتاج صلاحية CREATEDB.

## التنظيف اليومي (تلقائي)

الخادم يحذف كل يوم:

| البيانات | متى تُحذف |
|---|---|
| رموز الدخول | بعد يوم من انتهائها |
| الجلسات | بعد 7 أيام من انتهائها أو إلغائها (مع مدة التجديد) |
| روابط السلات المشتركة | بعد 7 أيام من انتهائها |
| سجل رسائل واتساب وSMS | الأقدم من 180 يوماً (`MESSAGE_LOG_DAYS`) |
| حسابات الزوار الخاملة | بعد 30 يوماً |

يدوياً:
```bash
npm run db:cleanup
```
