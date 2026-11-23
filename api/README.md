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
| GET | `/products?feed=for_you\|trending\|offers\|nearby\|new&category=&store=&q=&limit=&offset=` | بطاقات المنتجات (سعر، `discountPercent`، تقييم، «يصلك اليوم/غداً»). `offers` = «عروض»: المخفّضة فقط، الأعلى خصماً أولاً |
| GET | `/products/:id` | تفاصيل المنتج مع المقاسات/الألوان والمخزون |
| GET | `/products/:id/complete-the-look` | قطع تكمّل اللوك مع هذا المنتج |
| GET | `/categories` | الأقسام وعدد منتجاتها |
| GET | `/stores?featured=true` · `/stores/:slug` | المتاجر / متجر مع منتجاته |
| GET | `/looks?featured=true&store=` · `/looks/:idOrSlug` | اللوكات (كل لوك من متجر واحد) مع القطع والإجمالي |
| POST | `/looks/:idOrSlug/add-to-cart` | إضافة اللوك كاملاً. body اختياري: `{ variants: { productId: variantId }, replaceCart }` |
| GET | `/cart` | السلة (متجر واحد: `store`، `items`) + خيارا التوصيل (`fastest` / `standard`) + الإجماليات |
| POST | `/cart/items` | `{ variantId, quantity, replaceCart? }` — من متجر آخر ⇒ `409 cart_store_conflict` |
| PATCH / DELETE | `/cart/items/:variantId` | تعديل الكمية (`{ quantity }`، 0 = حذف) / حذف |
| DELETE | `/cart` | تفريغ السلة |
| POST | `/cart/share` | إنشاء رابط مشاركة → `{ token, url, expiresAt }` |
| GET | `/shared-carts/:token` | عرض السلة المشتركة |
| POST | `/shared-carts/:token/import` | نسخها إلى سلة المستخدم الحالي (`{ replaceCart? }`) |
| POST | `/checkout` | `{ deliveryMode: 'fastest' \| 'standard', addressId? }` → طلب واحد للمتجر |
| GET | `/orders` · `/orders/:id` | الطلبات / التفاصيل مع سجل الحالات |
| GET / PUT / DELETE | `/wishlist` · `/wishlist/:productId` | المفضلة |
| GET | `/me` | المستخدم وعنوانه الافتراضي |
| GET | `/health` | فحص الخادم وقاعدة البيانات |

الأخطاء دائماً: `{ "error": { "code": "insufficient_stock", "message": "المتوفر 3 فقط", "details": … } }`.

## لوحة الإدارة (`/v1/admin`)

كل مسار يحمّل بيانات الموظف أولاً: غير الموظف أو الموظف المعطّل ⇒ 403. ثم يتحقق من صلاحية واحدة. موظف المتجر يُقيَّد تلقائياً بمتجره.

| Method | Path | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/admin/me` | — | الموظف ودوره وصلاحياته |
| GET | `/admin/dashboard` | `dashboard.view` | الطلبات حسب الحالة، مبيعات اليوم، المتاجر، السائقون |
| GET · POST · PATCH | `/admin/stores` · `/admin/stores/:id` | `stores.read` / `stores.write` | المتاجر. الإضافة تتضمن صاحب المتجر `owner: { fullName, phone }`، والرسوم `deliveryFee` بالدرهم |
| GET | `/admin/roles` | `staff.read` | الأدوار وصلاحياتها |
| GET · POST · PATCH | `/admin/staff` · `/admin/staff/:id` | `staff.read` / `staff.write` | الموظفون. لا يمكن منح دور أعلى من صلاحياتك |
| GET · POST · PATCH | `/admin/drivers` · `/admin/drivers/:id` | `drivers.read` / `drivers.write` | السائقون وحالة التوفر |
| GET | `/admin/orders?status=&q=&storeId=` · `/admin/orders/:id` | `orders.read` | الطلبات والتفاصيل وسجل الحالات و`allowedNext` |
| POST | `/admin/orders/:id/status` | `orders.update_status` | `{ to, note?, cancelReason? }` |
| POST | `/admin/orders/:id/driver` | `orders.assign_driver` | `{ driverId }`. للطلبات المؤكدة أو قيد التجهيز |

قواعد الحالات: الانتقالات المسموحة هي نفسها المفروضة في قاعدة البيانات. «تم الشحن» يتطلب سائقاً، والإلغاء يتطلب سبباً ويعيد المخزون. يُسجَّل اسم من غيّر الحالة في `order_status_history.changed_by`.

## سلة من متجر واحد

كل سلة وكل طلب من متجر واحد فقط (جدول `carts`، migration 0003، ومحمي أيضاً بـ trigger في قاعدة البيانات).
إضافة منتج من متجر آخر ترجع:

```json
{ "error": { "code": "cart_store_conflict", "message": "سلتك الحالية من «أزياء لورا»…",
  "details": { "currentStore": { "slug": "laura", "name": "أزياء لورا" },
               "requestedStore": { "slug": "chic", "name": "شيك" }, "itemsCount": 3 } } }
```

بعد موافقة العميلة يعيد التطبيق الطلب نفسه مع `replaceCart: true`: تُفرَّغ السلة وتُربط بالمتجر الجديد في معاملة واحدة.

## قواعد التوصيل (`src/modules/delivery/delivery.ts`)

شحنة واحدة دائماً (متجر واحد). ساعات التوصيل 10:00–22:00 بتوقيت ليبيا؛ النقل 3 ساعات داخل المدينة و24 بين المدن.

- **أسرع توصيل:** مندوب خاص فور التجهيز. الرسوم = `stores.delivery_fee` + `EXPRESS_SURCHARGE` (افتراضياً 5 د.ل). الوصول = `prep_hours` + النقل.
- **توصيل عادي:** مع جولة التوصيل المعتادة. الرسوم = `stores.delivery_fee`. الوصول = ما سبق + `STANDARD_DELAY_HOURS` (افتراضياً 24).

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
