# ستايلو (Stylo)

**كل ستايل في مكان واحد** — منصة تجارة إلكترونية للموضة متعددة المتاجر للسوق الليبي (د.ل). كل سلة وكل طلب من متجر واحد، والتوصيل مباشر بمناديب ستايلو مع الدفع عند الاستلام وإقفال عُهدة المناديب النقدية.

| الجزء | المجلد | العنوان بعد التشغيل |
|---|---|---|
| **موقع الزبائن** (وتطبيق الجوال من نفس الكود) | `mobile/` | `http://localhost:4000/` |
| **وضع المندوب** (داخل نفس التطبيق) | `mobile/src/app/driver.tsx` | `http://localhost:4000/driver` |
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

الدخول برقم الهاتف الليبي ورمز من 6 أرقام **يصل عبر واتساب**. **في وضع التطوير يظهر الرمز على الشاشة أيضاً** في مربع أصفر «وضع التطوير» (واتساب غير مربوط افتراضياً).

| الرقم | الحساب | أين يدخل |
|---|---|---|
| `0910000001` | مدير ستايلو — مدير عام (كل الصلاحيات) | `/admin/` |
| `0910000006` | أحمد الزوي — مدير عمليات | `/admin/` |
| `0910000007` | هدى بن علي — خدمة العملاء (عرض فقط) | `/admin/` |
| `0910000002` | نورة الورفلي — مالكة «أزياء لورا» | `/admin/` (لوحة متجرها) |
| `0910000008` | ريم الترهوني — مديرة «أزياء لورا» | `/admin/` |
| `0910000011` | محمد الككلي — مندوب (لديه عُهدة 4 طلبات من 4 متاجر) | `/` ⇐ `/driver` |
| `0910000013` | سالم القماطي — مندوب | `/` ⇐ `/driver` |
| `0920000012` | علي المغربي — مندوب (بنغازي) | `/` ⇐ `/driver` |
| `0910000004` | سارة أحمد — زبونة (طرابلس) | `/` |
| `0920000005` | مريم علي — زبونة (بنغازي) | `/` |
| أي رقم ليبي آخر | يُنشأ حساب زبون جديد بعد كتابة الاسم | `/` |

**العمولة يراها المدير العام فقط** (`0910000001`). لا تظهر للمندوب ولا لصاحب المتجر ولا لموظف العمليات، والـ API يحذفها من الردود.

أصحاب المتاجر الآخرون: `0910000003` نوفا، `0910000021` فيونا، `0910000022` ستايلو كولكشن، `0910000023` لونا، `0910000024` شيك، `0920000025` فيلا.

## التطوير

| الأمر | الوظيفة |
|---|---|
| `npm run check` | TypeScript للمشاريع الثلاثة + Lint لتطبيق الجوال |
| `npm test` | اختبارات الـ API على قاعدة `stylo_test` |
| `npm --prefix api run dev` | الـ API مع إعادة التحميل التلقائي |
| `npm --prefix admin run dev` | لوحة الإدارة على `http://localhost:5174/admin/` |
| `cd mobile && npx expo start` | تطبيق الجوال / موقع الزبائن (Expo Go أو `w` للمتصفح) |

## تجربة التطبيق على الهاتف (الزبائن والمندوب)

على جهازك (الكمبيوتر والهاتف على نفس الـ Wi‑Fi، أو بأي شبكة مع `--tunnel`):

```bash
npm start                                   # الخادم على المنفذ 4000 (نافذة أولى)
cd mobile && npx expo start --tunnel        # نافذة ثانية: يظهر رمز QR
```

امسحي رمز QR بتطبيق **Expo Go** (إصدار يدعم SDK 57). مع `--tunnel` يجب أن يصل الهاتف للخادم أيضاً: شغّليه بعنوان عام (مثل `EXPO_PUBLIC_API_URL=https://<نطاقك>/v1`)، أو استخدمي `--lan` على نفس الشبكة فيجد التطبيق الخادم تلقائياً على المنفذ 4000.
للدخول كمندوب استخدمي `0910000011`؛ بعد الدخول تفتح «لوحة المندوب» مباشرة.

## للنشر على خادم حقيقي

في `api/.env`:

```
NODE_ENV=production
OTP_PEPPER=<سلسلة عشوائية 32 حرفاً أو أكثر>
MESSAGING_PROVIDER=whatsapp
WHATSAPP_TOKEN=<توكن System User من Meta>
WHATSAPP_PHONE_NUMBER_ID=<معرّف الرقم من WhatsApp Manager>
DATABASE_URL=<قاعدة الإنتاج>
```

ويلزم قالبان معتمدان في WhatsApp Manager باللغة العربية: `stylo_login_code` (فئة Authentication) و`stylo_order_status` (فئة Utility). التفاصيل في `api/.env.example`.

الخادم يرفض البدء في الإنتاج دون هذه القيم. ضعي أمامه HTTPS (مثل Caddy أو Nginx).

## المراجع

- [CLAUDE.md](CLAUDE.md) — هوية المشروع وقواعده التقنية.
- [api/README.md](api/README.md) — نقاط النهاية.
- [admin/README.md](admin/README.md) — لوحة الإدارة.
- [mobile/README.md](mobile/README.md) — تطبيق الجوال وموقع الزبائن.
- [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) — ما ينقص للإطلاق الكامل، بالترتيب.
