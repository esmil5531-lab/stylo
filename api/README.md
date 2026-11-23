# Stylo API — واجهة برمجة ستايلو

Fastify 5 + PostgreSQL. كل المبالغ بالدرهم الليبي (1 د.ل = 1000). القواعد العامة في [`../CLAUDE.md`](../CLAUDE.md).

## التشغيل

```bash
cp .env.example .env
npm install
npm run db:reset      # migrate + dev seed
npm run dev           # http://localhost:4000  (watch mode)
```

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | تشغيل الخادم مع إعادة التحميل |
| `npm run db:migrate` | تطبيق ملفات `database/migrations` الجديدة فقط (`schema_migrations`) |
| `npm run db:seed` | إعادة تعبئة بيانات التطوير (يمسح البيانات الحالية) |
| `npm test` | اختبارات تكامل على قاعدة `stylo_test` (`TEST_DATABASE_URL` لتغييرها) |
| `npm run typecheck` / `npm run build` | فحص الأنواع / البناء إلى `dist/` |

## المصادقة (مؤقتة)

حتى بناء تسجيل الدخول: خارج الإنتاج، الهيدر `x-user-id` يحدد المستخدم، وإلا يُستخدم `DEV_USER_ID` (سارة، طرابلس). في الإنتاج لا يوجد مستخدم ⇒ مسارات المستخدم ترجع 401.

مستخدمو البذور: `…0004` سارة (طرابلس)، `…0005` مريم (بنغازي).

## نقاط النهاية (`/v1`)

| Method | Path | الوصف |
|---|---|---|
| GET | `/home` | البانرات، اللوك المميز («كمّل اللوك»)، المتاجر المختارة |
| GET | `/products?feed=for_you\|trending\|new\|nearby&category=&store=&q=&limit=&offset=` | بطاقات المنتجات (سعر، تقييم، «يصلك اليوم/غداً») |
| GET | `/products/:id` | تفاصيل المنتج مع المقاسات/الألوان والمخزون |
| GET | `/products/:id/complete-the-look` | قطع تكمّل اللوك مع هذا المنتج |
| GET | `/categories` | الأقسام وعدد منتجاتها |
| GET | `/stores?featured=true` · `/stores/:slug` | المتاجر / متجر مع منتجاته |
| GET | `/looks?featured=true` · `/looks/:idOrSlug` | اللوكات مع القطع والإجمالي |
| POST | `/looks/:idOrSlug/add-to-cart` | إضافة اللوك كاملاً (body اختياري: `{ variants: { productId: variantId } }`) |
| GET | `/cart` | السلة مجمّعة حسب المتجر + عرضا التوصيل (`fastest` / `unified`) + الإجماليات |
| POST | `/cart/items` | `{ variantId, quantity }` |
| PATCH / DELETE | `/cart/items/:variantId` | تعديل الكمية (`{ quantity }`، 0 = حذف) / حذف |
| DELETE | `/cart` | تفريغ السلة |
| POST | `/cart/share` | إنشاء رابط مشاركة → `{ token, url, expiresAt }` |
| GET | `/shared-carts/:token` | عرض السلة المشتركة |
| POST | `/shared-carts/:token/import` | نسخها إلى سلة المستخدم الحالي |
| POST | `/checkout` | `{ deliveryMode: 'fastest' \| 'unified', addressId? }` → طلب لكل متجر |
| GET | `/orders` · `/orders/:id` | الطلبات / التفاصيل مع سجل الحالات |
| GET / PUT / DELETE | `/wishlist` · `/wishlist/:productId` | المفضلة |
| GET | `/me` | المستخدم وعنوانه الافتراضي |
| GET | `/health` | فحص الخادم وقاعدة البيانات |

الأخطاء دائماً: `{ "error": { "code": "insufficient_stock", "message": "المتوفر 3 فقط", "details": … } }`.

## قواعد التوصيل (`src/modules/delivery/delivery.ts`)

- **أسرع توصيل:** كل متجر يشحن وحده فور التجهيز. الرسوم = مجموع `stores.delivery_fee`. الوصول = التجهيز (`prep_hours`) + النقل (3 ساعات داخل المدينة، 24 بين المدن)، ضمن ساعات التوصيل 10:00–22:00 بتوقيت ليبيا.
- **توصيل موحد:** شحنة واحدة لكل المتاجر، رسوم ثابتة `UNIFIED_DELIVERY_FEE` (افتراضياً 15 د.ل)، الوصول = أبطأ تجهيز + `CONSOLIDATION_HOURS` + أبطأ نقل. متاح فقط عند وجود متجرين أو أكثر.

## البنية

```
src/
├── app.ts            # buildApp(): CORS، المصادقة المؤقتة، معالج الأخطاء، /v1
├── server.ts         # نقطة التشغيل
├── config.ts         # متغيرات البيئة (zod)
├── db.ts             # Pool + withTransaction
├── lib/              # errors, context (Ctx), validation
└── modules/
    ├── catalog/  stores/  looks/  home/
    ├── cart/         # السلة متعددة المتاجر + المشاركة + إضافة اللوك
    ├── delivery/     # قواعد التوصيل (دوال نقية)
    ├── orders/       # checkout + الطلبات
    └── wishlist/  users/
```
