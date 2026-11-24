# ربط ستايلو بقاعدة بيانات Supabase

## لماذا يظهر `getaddrinfo ENOTFOUND db.….supabase.co`؟
العنوان المباشر `db.<project-ref>.supabase.co` يعمل على **IPv6 فقط**. أغلب شبكات المنازل وWindows لا تدعم IPv6، فلا يجد الجهاز العنوان. الحل: عنوان **Session pooler** الذي يعمل على IPv4.

## الخطوات
1. افتحي مشروعك في Supabase. إن ظهر «Project paused» اضغطي **Restore project** وانتظري حتى يعمل.
2. اضغطي **Connect** أعلى الصفحة ← تبويب **Connection String** ← اختاري **Session pooler** (وليس Direct connection).
3. انسخي الرابط. شكله:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   - اسم المستخدم `postgres.<project-ref>` بالنقطة، والمنفذ **5432**.
   - ضعي كلمة مرور قاعدة البيانات مكان `[YOUR-PASSWORD]` (إن نسيتِها: Database → Settings → Reset database password).
   - إن احتوت كلمة المرور على `@` أو `#` أو `/` اكتبيها هكذا: `%40` و`%23` و`%2F`.
4. في `api/.env` ضعي الرابط في `DATABASE_URL` (سطر واحد، بلا مسافات أو علامات تنصيص).
5. افحصي الاتصال:
   ```
   npm run db:check
   ```
   يجب أن ترَي ✓ في: DNS، والاتصال، ثم في الجداول.
6. أنشئي الجداول والبيانات التجريبية (للتطوير فقط — يمسح البيانات الموجودة):
   ```
   npm run db:reset
   ```
7. شغّلي الخادم `npm start` وافتحي `http://localhost:4000/health`: يجب أن يظهر `"database":"connected"`.

## SSL
يتصل الخادم بـ Supabase بشكل مشفّر تلقائياً (`DATABASE_SSL=require`). للتحقق الكامل من الشهادة في الإنتاج: نزّلي **SSL certificate** من Database → Settings وضعي مساره في `DATABASE_CA_FILE` (يصبح الوضع `verify`).

## رسائل الأخطاء الشائعة
| الرسالة | السبب | الحل |
|---|---|---|
| `ENOTFOUND db.…supabase.co` | العنوان المباشر IPv6 فقط، أو المشروع متوقف | Session pooler، أو Restore project |
| `password authentication failed` | كلمة مرور خاطئة أو رموز غير مرمّزة | أعيدي تعيينها، ورمّزي `@ # /` |
| `Tenant or user not found` | المستخدم `postgres` بدل `postgres.<ref>` أو منطقة خاطئة | انسخي الرابط كما هو من Connect |
| `self-signed certificate` | تحقق الشهادة دون ملف CA | `DATABASE_SSL=require` أو `DATABASE_CA_FILE` |
| `relation … does not exist` | الجداول غير منشأة | `npm run db:reset` |
