# نشر ستايلو على استضافة حقيقية وظهوره في Google

كل ما يلزم في المستودع: `Dockerfile` (صورة واحدة: الـ API + موقع الزبائن + لوحة الإدارة) و `deploy/` (PostgreSQL + HTTPS تلقائي بـ Caddy + نسخ احتياطي يومي).

## ما تحتاجينه قبل البدء

| البند | ملاحظات |
|---|---|
| **نطاق (Domain)** | مثل `stylo.ly` (من مسجّل نطاقات `.ly` المعتمد) أو `stylo-ly.com`. |
| **خادم VPS** | Ubuntu 24.04، 2 vCPU و 4GB RAM و 40GB SSD تكفي للبداية (Hetzner أو DigitalOcean أو Contabo أو مزوّد محلي). |
| **DNS** | سجل `A` للنطاق و `www` ← عنوان IP للخادم، **قبل** أول تشغيل (لتصدر شهادة HTTPS). |
| **واتساب** | توكن ومعرّف الرقم والقالبان المعتمدان (انظري `api/.env.example`). |

## التشغيل على الخادم (مرة واحدة)

```bash
# 1) Docker
curl -fsSL https://get.docker.com | sh

# 2) الكود
git clone https://github.com/esmil5531-lab/stylo.git && cd stylo/deploy

# 3) الإعدادات
cp .env.example .env                         # DOMAIN و POSTGRES_PASSWORD (openssl rand -hex 24)
cp .env.production.example .env.production   # PUBLIC_SITE_URL و OTP_PEPPER وواتساب و GOOGLE_SITE_VERIFICATION
nano .env && nano .env.production

# 4) التشغيل (يبني الصورة، يطبّق migrations، يصدر شهادة HTTPS)
docker compose up -d --build

# 5) أول مدير عام + الأقسام الافتراضية (قاعدة الإنتاج فارغة؛ بيانات التطوير لا تُحمَّل أبداً)
docker compose exec app node dist/scripts/bootstrap.js --phone 09XXXXXXXX --name "اسم المدير"
```

بعدها: `https://<النطاق>/` موقع الزبائن، و `https://<النطاق>/admin/` لوحة الإدارة (يدخل المدير برقمه ورمز واتساب، ثم يضيف المتاجر والموظفين والمناديب من اللوحة).

### التحديث لاحقاً

```bash
cd stylo && git pull && cd deploy && docker compose up -d --build
```

الـ migrations الجديدة تُطبَّق تلقائياً عند بدء التشغيل.

### النسخ الاحتياطي

خدمة `backup` تأخذ نسخة يومية في `deploy/backups` (14 يوماً، 8 أسابيع، 6 أشهر). انسخي هذا المجلد دورياً خارج الخادم (مثل تخزين سحابي). الاسترجاع:

```bash
gunzip -c backups/daily/<الملف>.sql.gz | docker compose exec -T db psql -U stylo -d stylo
```

## الظهور في Google

ما هو جاهز في الكود:

- `/robots.txt`: يسمح بالموقع ويمنع `/admin/` و `/v1/` والسلة والحساب والطلبات ولوحة المندوب، ويشير إلى خريطة الموقع.
- `/sitemap.xml`: الرئيسية، والأقسام، وكل المتاجر واللوكات والمنتجات النشطة مع صورها وتاريخ التعديل. تتحدث تلقائياً من قاعدة البيانات.
- لكل صفحة: `<title>` ووصف عربي بالسعر بالدينار، و`canonical` بنطاق https، و OpenGraph/Twitter لمعاينة الروابط في واتساب وفيسبوك، و `<noscript>` بملخص المحتوى.
- بيانات منظمة (JSON-LD): `Product` بالسعر `LYD` والتوفر والتقييم (Rich Results)، و `ClothingStore` للمتاجر، و `WebSite`/`Organization` للرئيسية.
- الصفحات الخاصة `noindex`، والمنتج غير الموجود يرجع 404.
- الفهرسة تعمل في الإنتاج فقط (`SEO_INDEXING`)، فلا تظهر نسخ التجربة في Google.

ما تفعلينه بعد النشر:

1. ادخلي إلى [Google Search Console](https://search.google.com/search-console) وأضيفي النطاق.
2. التحقق: «HTML tag» ← ضعي قيمة `content` في `GOOGLE_SITE_VERIFICATION` ثم `docker compose up -d`. أو سجل TXT في DNS.
3. «Sitemaps» ← أرسلي `https://<النطاق>/sitemap.xml`.
4. «URL Inspection» لصفحة منتج ← «Request indexing». واختبري المنتج في [Rich Results Test](https://search.google.com/test/rich-results).
5. الظهور يبدأ عادة خلال أيام إلى أسابيع، ويتحسن بالصور الحقيقية ووصف جيد لكل منتج وروابط من حسابات ستايلو في التواصل الاجتماعي.

## تطبيق الجوال على النطاق الحقيقي

عند بناء التطبيق للمتاجر (EAS Build) اجعليه يتصل بالخادم الحقيقي:

```bash
EXPO_PUBLIC_API_URL=https://<النطاق>/v1 eas build --platform all
```
