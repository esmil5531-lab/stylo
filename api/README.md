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

## المصادقة

برقم الهاتف ورمز التحقق (انظري «الدخول برقم الهاتف» أدناه). الهيدر `x-user-id` يعمل في الاختبارات فقط (`AUTH_DEV_HEADER=true`)، وأرقام حسابات البذور في [README الرئيسي](../README.md).

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
| GET · PATCH | `/me` | المستخدم وعنوانه الأساسي وعدد عناوينه · تعديل الاسم `{ fullName }` |
| GET | `/cities` | المدن التي يوصل لها ستايلو (مدينة العنوان من هذه القائمة) |
| GET · POST | `/me/addresses` | «عناويني» · إضافة `{ label?, recipientName, phone, city, district?, street, building?, landmark?, isDefault? }` (أول عنوان أساسي تلقائياً، 10 كحد أقصى) |
| PATCH · DELETE | `/me/addresses/:id` | تعديل ما يُرسل فقط · حذف (حذف الأساسي يجعل آخر عنوان مستخدم أساسياً) |
| POST | `/me/addresses/:id/default` | جعله العنوان الأساسي — هو الذي يحدد رسوم التوصيل وموعده في السلة والمنتجات |
| GET | `/health` | فحص الخادم وقاعدة البيانات |

الأخطاء دائماً: `{ "error": { "code": "insufficient_stock", "message": "المتوفر 3 فقط", "details": … } }`.

## الدخول برقم الهاتف

| Method | Path | الوصف |
|---|---|---|
| POST | `/auth/otp/request` | `{ phone }` ⇐ يرسل رمزاً من 6 أرقام صالحاً 5 دقائق. في التطوير يعود الرمز في `devCode` |
| POST | `/auth/otp/verify` | `{ phone, code, app: 'customer' \| 'admin', fullName? }` ⇐ `{ token, expiresAt, user }`. الرقم الجديد يحتاج `fullName`، وإلا يعود `name_required` |
| POST | `/auth/logout` | ينهي الجلسة |

بعد الدخول تُرسل كل الطلبات مع `Authorization: Bearer <token>`.

## واتساب (الرموز وإشعارات الطلبات)

`src/lib/messaging.ts`. القناة حسب `MESSAGING_PROVIDER`:

| القيمة | ما يحدث |
|---|---|
| `console` (التطوير) | لا يُرسل شيء؛ الرمز يظهر على الشاشة (`devCode`) وتُكتب إشعارات الطلبات في السجل |
| `whatsapp` | WhatsApp Business Cloud API: `POST https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages` بـ `Bearer WHATSAPP_TOKEN` |
| `sms_http` | بديل اختياري: `POST SMS_HTTP_URL { to, text }` |

- رمز الدخول: قالب **Authentication** (`WHATSAPP_OTP_TEMPLATE`، افتراضياً `stylo_login_code`): `{{1}}` = الرمز + زر «نسخ الرمز».
- حالة الطلب: قالب **Utility** (`WHATSAPP_ORDER_TEMPLATE`، افتراضياً `stylo_order_status`): `{{1}}` الاسم، `{{2}}` رقم الطلب، `{{3}}` الحالة، `{{4}}` المتجر. يُرسل بعد إتمام الطلب، وتغيير الحالة من اللوحة، وأفعال المندوب.
- كل إرسال يُسجَّل في `message_log` (دون الرمز). فشل إرسال الرمز ⇐ `503 message_failed`.
- `/auth/otp/request` يعيد `channel` (`whatsapp` | `sms` | `console`).

## عُهدة المناديب (`/v1/admin/custody`)

| Method | Path | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/admin/custody` | `custody.read` | كل مندوب: النقد في عهدته، عدد الطلبات والمتاجر، منذ متى، آخر تقفيل |
| GET | `/admin/custody/:driverId` | `custody.read` | تفصيل العُهدة: الطلبات، وصافي استحقاق كل متجر |
| POST | `/admin/custody/:driverId/settle` | `custody.manage` | `{ amountReceived, expectedAmount?, note? }` ⇐ تقفيل العُهدة باسم الموظف ووقته، وتعود العُهدة صفراً. الفرق يتطلب ملاحظة |
| GET | `/admin/custody/settlements?driverId=` · `/admin/custody/settlements/:id` | `custody.read` | سجل التقفيل وتفاصيله |

العمولة ورسوم التوصيل وقيمة المنتجات تظهر في هذه الردود **للمدير العام فقط** (`finance.view`). الآخرون يرون النقد وصافي كل متجر.

## وضع المندوب (`/v1/driver`)

لحسابات `drivers` المفعّلة فقط (غير ذلك ⇐ 403). لا تحتوي أي رد على العمولة أو مستحقات المتاجر.

| Method | Path | الوصف |
|---|---|---|
| GET | `/driver/me` | المندوب، العُهدة النقدية الحالية، طلبات اليوم، آخر تسليم للعُهدة |
| PATCH | `/driver/me/status` | `{ status: 'available' \| 'offline' }` (لا يمكن إنهاء الدوام وطلب في الطريق) |
| GET | `/driver/orders` | `{ active, deliveredToday }` مع عنوان المتجر والزبون وهاتفيهما والمبلغ المطلوب تحصيله |
| POST | `/driver/orders/:id/picked-up` | قيد التجهيز ⇐ تم الشحن (للمندوب المسند فقط) |
| POST | `/driver/orders/:id/delivered` | تم الشحن ⇐ تم التسليم، ويدخل المبلغ عُهدة المندوب |

## مستحقات المتاجر (`/v1/admin/payouts`)

| Method | Path | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/admin/payouts/balances` | `payouts.read` (المدير العام، ومالك المتجر لمتجره) | المستحق لكل متجر: الطلبات المسلّمة غير المسوّاة |
| GET | `/admin/payouts/preview?storeId&from&to` | `payouts.manage` | معاينة التسوية للفترة (حسب يوم التسليم) |
| POST | `/admin/payouts` | `payouts.manage` | `{ storeId, from, to, note? }` ⇐ تسوية «معلّقة» |
| POST | `/admin/payouts/:id/paid` | `payouts.manage` | `{ reference }` ⇐ «مدفوعة» مع رقم الحوالة |
| DELETE | `/admin/payouts/:id` | `payouts.manage` | إلغاء تسوية معلّقة، فتعود طلباتها غير مسوّاة |
| GET | `/admin/payouts` · `/admin/payouts/:id` | `payouts.read` | سجل التسويات وتفاصيلها |

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
| GET · PATCH | `/admin/my-store` | `store.profile` | إعدادات متجر الموظف (الأسماء، الهاتف، العنوان، وقت التجهيز) |
| GET | `/admin/categories` | `products.read` | الأقسام |
| GET | `/admin/products?status=&q=&storeId=&lowStock=true` | `products.read` | المنتجات مع المقاسات والمخزون (موظف المتجر: متجره فقط) |
| GET · POST · PUT | `/admin/products/:id` · `/admin/products` | `products.read` / `products.write` | منتج كامل مع `variants: [{ id?, size, colorName, colorHex, sku?, price?, stock }]` |
| GET | `/admin/reports?from=YYYY-MM-DD&to=&storeId=` | `reports.view` | المبيعات، العمولة، مستحقات المتاجر، إيراد ستايلو، يومياً، حسب المتجر، الأكثر مبيعاً |

نسبة العمولة (`commissionBps`، بالنقاط الأساسية: 1000 = 10%) لا تُرسل في إنشاء/تعديل المتجر إلا بصلاحية `stores.commission`.

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
