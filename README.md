# ستايلو (Stylo)

**كل ستايل في مكان واحد** — منصة تجارة إلكترونية للموضة متعددة المتاجر للسوق الليبي (د.ل). كل سلة وكل طلب من متجر واحد، والتوصيل مباشر بسائقي ستايلو.

| الجزء | المجلد | العنوان بعد التشغيل |
|---|---|---|
| **موقع الزبائن** (وتطبيق الجوال من نفس الكود) | `mobile/` | `http://localhost:4000/` |
| **موقع الإدارة والموظفين والمتاجر** | `admin/` | `http://localhost:4000/admin/` |
| الـ API | `api/` | `http://localhost:4000/v1/…` |
| قاعدة البيانات | `database/` | PostgreSQL |

خادم واحد (الـ API) يقدّم الموقعين والـ API معاً من نفس العنوان.

## التشغيل (مرة واحدة)

المتطلبات: Node.js 20+، و PostgreSQL 14+.

```bash
sudo -u postgres psql -c "CREATE ROLE stylo LOGIN PASSWORD 'stylo';"
sudo -u postgres psql -c "CREATE DATABASE stylo_dev OWNER stylo;"
sudo -u postgres psql -c "CREATE DATABASE stylo_test OWNER stylo;"
sudo -u postgres psql -d stylo_dev -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext;"
cp api/.env.example api/.env
npm run install:all
npm run db:reset
npm run build
npm start
```

ثم افتحي:
- موقع الزبائن: `http://localhost:4000/`
- موقع الإدارة والمتاجر: `http://localhost:4000/admin/`

بعد أي `npm run build` جديد أعيدي تشغيل `npm start` (الخادم يقرأ ملفات الموقعين عند بدء التشغيل).

## الدخول

الدخول برقم الهاتف الليبي ورمز من 6 أرقام. **في وضع التطوير لا توجد رسائل SMS بعد، فيظهر الرمز على الشاشة** في مربع أصفر «وضع التطوير».

| الرقم | الحساب | أين يدخل |
|---|---|---|
| `0910000001` | مدير ستايلو — مدير عام (كل الصلاحيات) | `/admin/` |
| `0910000006` | أحمد الزوي — مدير عمليات | `/admin/` |
| `0910000007` | هدى بن علي — خدمة العملاء (عرض فقط) | `/admin/` |
| `0910000002` | نورة الورفلي — مالكة «أزياء لورا» | `/admin/` (لوحة متجرها) |
| `0910000008` | ريم الترهوني — مديرة «أزياء لورا» | `/admin/` |
| `0910000004` | سارة أحمد — زبونة (طرابلس) | `/` |
| `0920000005` | مريم علي — زبونة (بنغازي) | `/` |
| أي رقم ليبي آخر | يُنشأ حساب زبون جديد بعد كتابة الاسم | `/` |

أصحاب المتاجر الآخرون: `0910000003` نوفا، `0910000021` فيونا، `0910000022` ستايلو كولكشن، `0910000023` لونا، `0910000024` شيك، `0920000025` فيلا.

## التطوير

| الأمر | الوظيفة |
|---|---|
| `npm run check` | TypeScript للمشاريع الثلاثة + Lint لتطبيق الجوال |
| `npm test` | اختبارات الـ API على قاعدة `stylo_test` |
| `npm --prefix api run dev` | الـ API مع إعادة التحميل التلقائي |
| `npm --prefix admin run dev` | لوحة الإدارة على `http://localhost:5174/admin/` |
| `cd mobile && npx expo start` | تطبيق الجوال / موقع الزبائن (Expo Go أو `w` للمتصفح) |

## للنشر على خادم حقيقي

في `api/.env`:

```
NODE_ENV=production
OTP_PEPPER=<سلسلة عشوائية 32 حرفاً أو أكثر>
SMS_PROVIDER=http
SMS_HTTP_URL=<بوابة الرسائل>
SMS_HTTP_TOKEN=<المفتاح>
DATABASE_URL=<قاعدة الإنتاج>
```

الخادم يرفض البدء في الإنتاج دون هذه القيم. ضعي أمامه HTTPS (مثل Caddy أو Nginx).

## المراجع

- [CLAUDE.md](CLAUDE.md) — هوية المشروع وقواعده التقنية.
- [api/README.md](api/README.md) — نقاط النهاية.
- [admin/README.md](admin/README.md) — لوحة الإدارة.
- [mobile/README.md](mobile/README.md) — تطبيق الجوال وموقع الزبائن.
- [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) — الخطوات التالية: رفع الصور وتطبيق السائق.
