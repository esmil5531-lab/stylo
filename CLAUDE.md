# CLAUDE.md — ستايلو (Stylo)

This file is the source of truth for every session working on this repo. Read it fully before changing anything. Update it in the same commit whenever a rule here changes.

## 1. Project identity (do not change without explicit owner approval)

| | |
|---|---|
| Name (Arabic) | **ستايلو** |
| Name (Latin) | **Stylo** (header wordmark: **STYLO**, serif, deep burgundy) |
| Official tagline | **كل ستايل في مكان واحد** (exact text — no rewording, no added punctuation) |
| Product | Multi-vendor fashion e-commerce marketplace: many independent stores sell on one platform |
| Market | **Libya** (LY). Default city for estimates: طرابلس |
| Currency | **Libyan dinar, LYD, shown as «د.ل»** (e.g. `199 د.ل`). LYD has **3 decimals**: money is stored in **dirhams** (1 د.ل = 1000), so 199 د.ل = `199000` |
| Primary language | Arabic, RTL. English is secondary/optional |
| Visual reference | The owner-approved mockup (deep burgundy `#5B0E2D`, soft pink hero, white cards, green «يصلك اليوم» badges). Tokens live in `mobile/src/theme/index.ts`. Do not invent a different look |

Brand constants live in `mobile/src/constants/brand.ts`. Never hard-code the name or tagline elsewhere.

### Core features (must keep working)
- **One store per cart and per order** (owner decision). A cart holds items from a single store. Adding an item from another store shows a dialog with two choices: «ابدئي سلة جديدة من …» (empties the cart and rebinds it) or «الإبقاء على سلتي الحالية». Never mix stores in a cart, order, shared cart or look.
- **Home tabs** — «لأجلك · ترند · عروض · قريب منك». «عروض» = discounted products only (`compare_at_price > base_price`), biggest discount first, with a «-23%» badge.
- **كمّل اللوك** — looks are curated **per store** so the whole look fits one cart; shown on home, on product pages (same store) and as a look page with «add the whole look to cart».
- **Delivery choice (one parcel)** — «أسرع توصيل» (priority courier; store fee + `EXPRESS_SURCHARGE`) vs «توصيل عادي» (next regular round; store fee only, + `STANDARD_DELAY_HOURS`). «توصيل موحد» (multi-store) is retired and only appears on old orders.
- **Cart sharing** — single-store snapshot link `…/shared-cart/<token>`; the recipient can view it and add everything to their own cart (same store rule applies).
- **Driver mode («لوحة المندوب»)** — inside the same mobile app at `/driver` for users with role `driver` (they land there after sign-in): status, cash in custody, assigned orders with call buttons, «استلمت الطلب من المتجر» (processing → shipped) and «تم التسليم واستلام X د.ل» (shipped → delivered + cash collected).
- **Driver cash custody («عُهدة المناديب»)** — orders are cash on delivery; the cash a driver collects stays in their custody until staff close it («تقفيل العُهدة») in the back office, recording amount received, time and receiving employee. Custody then resets to zero.

### Colors & contrast
- Body/secondary text must meet WCAG AA (≥ 4.5:1): use `ink`, `inkSecondary` or `inkMuted`. `inkFaint` (3.9:1) is only for icons, disabled controls and decoration — never for text people must read.
- White text only on `primary` / `primaryDark` / `sale` / `success`. Contrast ratios are documented at the top of `theme/index.ts`; re-check them when changing a color.

## 2. Repository layout

```
/
├── CLAUDE.md                  ← this file
├── admin/                     ← back office web app (Vite + React + TS), RTL — see admin/README.md
├── api/                       ← HTTP API (Node 20+, Fastify 5, pg, zod) — see api/README.md
│   ├── src/app.ts             ← app factory: CORS, dev auth, error handler, /v1 routes
│   ├── src/modules/<area>/    ← <area>.routes.ts (HTTP + validation) + <area>.service.ts (SQL + rules)
│   ├── src/scripts/           ← migrate.ts, seed.ts
│   └── test/                  ← integration tests against a real PostgreSQL
├── database/
│   ├── migrations/            ← numbered, forward-only SQL (0001_init.sql, 0002_…)
│   └── seeds/                 ← dev-only data (never run in production)
└── mobile/                    ← Expo app (see mobile/README.md and mobile/AGENTS.md)
    └── src/
        ├── app/               ← Expo Router routes ONLY ((tabs)/, product/[id], look/[id], …)
        ├── api/               ← client.ts (fetch + errors), types.ts, hooks.ts (React Query)
        ├── components/        ← shared UI components
        ├── constants/         ← brand, order statuses
        ├── i18n/              ← Arabic strings + RTL setup
        ├── lib/               ← format (prices, delivery labels), color helpers
        └── theme/             ← colors, spacing, radius, fonts
```

## 3. Tech stack (pinned)

- **Mobile:** Expo **SDK 57** (`expo ~57.0.x`, React Native 0.86, React 19.2), TypeScript strict, Expo Router (file-based, `src/app`), TanStack React Query for server state, expo-image.
- **API:** Node 20+, Fastify 5, `pg`, zod 4, TypeScript (ESM, `.js` import suffixes), run with `tsx`.
- **Database:** **PostgreSQL** (16 in dev; 14+ supported). Extensions: `pgcrypto`, `citext`.
- **Fonts:** Cairo (Arabic UI) + Cinzel (STYLO and store wordmarks), loaded in `src/app/_layout.tsx`.
- Do not upgrade the Expo SDK without an explicit request. Expo APIs change every SDK — check the versioned docs at `https://docs.expo.dev/versions/v57.0.0/` instead of relying on memory.

## 4. Mobile rules

### Dependencies
- Add packages with `npx expo install <pkg>` (never plain `npm install`) so versions match SDK 57.
  - If `api.expo.dev` is unreachable (sandboxed environments), use `EXPO_OFFLINE=1 npx expo install <pkg>`; it resolves versions from `expo/bundledNativeModules.json`.
- `react-native-reanimated` / `react-native-worklets` / `react-native-gesture-handler` are pinned explicitly because `expo-router` lists reanimated as an optional peer; without the pin npm picks an incompatible version and installs fail with ERESOLVE.

### Arabic & RTL — mandatory
- The whole app is RTL. Native: forced by the `expo-localization` plugin (`supportsRTL`, `forcesRTL` in `app.json`) plus `ensureRTL()` in `src/i18n/rtl.ts`. Web: `<html lang="ar" dir="rtl">` in `src/app/+html.tsx`.
- **Never** use `textAlign: 'left' | 'right'`, `marginLeft/Right`, `paddingLeft/Right`, `left/right` positioning. Use natural alignment (omit `textAlign`) and logical props: `marginStart/End`, `paddingStart/End`, `start/end`. `flexDirection: 'row'` already follows RTL.
- Text whose first character is Latin or a digit (sizes like `L`, dates, `× 1`) resolves as LTR and aligns left. Put the Arabic part first, or add `writingDirection: 'rtl'`.
- Directional icons must be mirrored: use `directionalIcons` from `src/i18n/rtl.ts` (back = `arrow-forward`).
- All user-facing text goes in `src/i18n/ar.ts` — no inline Arabic strings in screens.
- Use `fonts.*` from `@/theme` instead of `fontWeight` (with custom fonts each weight is a separate family). Cairo is tall: give labels a `lineHeight` (the tab bar renders its own label for this reason).
- Prices arrive as integers in minor units; always display with `formatPrice()` from `src/lib/format.ts` → `199 د.ل`.

### Data & navigation
- All server calls go through `src/api/hooks.ts` (React Query). Screens render loading / error-with-retry through `<QueryState>`; mutation errors show `errorMessage(err)` (the API's Arabic message).
- Cart mutations return the whole cart and write it into the `['cart']` cache — don't refetch manually.
- Anything that adds to the cart (product, look, shared cart) must go through `useStoreConflictGuard()` (`components/cart/StoreConflictDialog.tsx`) so a store conflict opens the two-choice dialog instead of an error.
- API URL: `EXPO_PUBLIC_API_URL`, else derived from the Metro host (port 4000). See `src/api/client.ts`.
- In SDK 57, `<Link asChild>` throws if the child gets an **array** style. Use `Pressable` + `router.push(...)` for styled tappable cards.
- Product/banner photos come from the API (`product_images`, `banners.image_url`). Without a photo, `ProductImage` draws a tinted tile with a garment icon — keep that fallback.

### Code
- Path alias `@/*` → `mobile/src/*`.
- Routes only in `src/app/`; everything else outside it.
- Before declaring work done, run from `mobile/`: `npm run typecheck` and `npm run lint`.
- `ios/` and `android/` are generated (CNG). Never commit or hand-edit them; configure via `app.json` / config plugins.

## 5. Back office (لوحة الإدارة) rules

- Separate app in `admin/` (Vite + React 19 + React Router 7 + React Query), port 5174. It never talks to PostgreSQL directly: everything goes through `/v1/admin/*`.
- **Permissions are enforced by the API**, never only by hiding UI. Every admin route calls `can(req, '<permission>')`. Permission keys live in `api/src/modules/admin/permissions.ts`; roles (`staff_roles`) are lists of those keys.
- Store-scoped staff (`staff_members.store_id` set, e.g. `store_manager`) only ever see their store: scope every new admin query with the staff context. They may move orders to `confirmed`/`processing`/`cancelled` only; `shipped`/`delivered` are Stylo operations.
- No privilege escalation: nobody can grant or edit a role with permissions they don't hold, and nobody can deactivate or re-role themselves.
- Order status changes go through `changeOrderStatus` (sets `stylo.actor_id` so history records who did it). `shipped` requires an assigned driver (also a DB CHECK). Cancelling requires a reason and restocks the items. Driver status follows automatically: `busy` while they have a shipped order, `available` after.
- Update (PATCH) schemas must not contain zod `.default()`s — `.partial()` keeps defaults and would silently reset fields the client didn't send. Defaults belong on create schemas only.
- Money inputs are typed in د.ل by staff and sent to the API in dirhams (`parseLYD` in `admin/src/lib/format.ts`).
- Order numbers next to Arabic text must be direction-isolated: `<OrderNo>` in admin, `\u2066…\u2069` in mobile strings — otherwise "#100001" renders as "100001#".
- Staff and store owners sign in with their phone + one-time code (`admin/src/pages/Login.tsx`, `app: 'admin'`). Only active `staff_members` get in; the back office never creates accounts. The token lives in localStorage and admin sessions last 12 hours. Change user ⇒ the query cache is cleared **during render** (never in an effect: that cancels the first requests and leaves screens spinning).

### Store panel (لوحة المتجر)
- Stores manage themselves **inside the same back office**, scoped to their store: role `store_owner` («مالك المتجر», products + orders + settings + reports) and `store_manager`. Creating a store gives its owner `store_owner` automatically. One staff account = one store (an owner of several stores needs separate accounts until store switching exists).
- A store edits its own profile at `/my-store` (names, logo text, phone, district, address, prep hours). **Delivery fee, status and commission are Stylo decisions** (Stylo runs the drivers) and are read-only there.
- Store staff can never mark products «مميز»; `isFeatured` from store staff is ignored.

### Products & sizes
- Sizes/colours are `product_variants` rows: one per (size, colour) — unique index `product_variants_size_color_uniq` — each with its own stock and optional price override, ordered by `position` (the order the store picked). Products without sizes have one variant with `size = NULL` («مقاس واحد»).
- The product form (`admin/src/pages/ProductForm.tsx`) builds the size × colour matrix from presets in `admin/src/lib/sizes.ts`; SKUs are generated (`<STORE3>-<6 hex>`) when left empty. Saving sends all variants: listed ids are updated, new ones inserted, missing ones deleted (past orders keep their snapshot).
- Customers pick size and colour separately (`mobile/src/components/product/VariantPicker.tsx`); a sold-out size gets a «نفد» caption — never a strike-through (it turns "L" into "Ł").

### Commission is for the general manager only
- Permission `finance.view` (super admin only) unlocks every commission figure. For everyone else the API strips them: `redactFinance()` (`permissions.ts`, a `preSerialization` hook on `/v1/admin`) removes `commission`, `commissionBps`, `currentCommissionBps`, `effectiveCommissionBps`, `realisedCommission`, `styloRevenue`.
- Also remove anything that lets people subtract their way to it: custody for non-finance staff carries only cash + store net (no subtotal / delivery fee); reports for platform staff without `finance.view` drop store dues (`storePayout`, `payout`); store payouts (`payouts.read`) are super admin + store owners (their own store) only.
- Driver endpoints never select commission or store dues. The UI hides commission columns with `useCan('finance.view')` — but the API is the guard. New admin endpoints returning money must be checked with a non-finance user in tests (`hasCommission()` in `api/test/custody-driver.test.ts`).

### Driver custody (عُهدة المناديب)
- `api/src/modules/admin/custody.admin.ts`. Custody = delivered COD orders (`payment_method = 'cod'`, `cash_collected_at` set) of a driver not yet in `driver_settlement_orders`. Amount = order total (merchandise + delivery fee). Store net per store = subtotal − commission.
- `cash_collected_at` is set when an order becomes delivered with a driver (driver app or back office). Settling locks the driver row and the orders (`FOR UPDATE`), refuses when the total changed since the screen was loaded (`expectedAmount` → `custody_changed`), and requires a note when the amount received differs. Each order is settled once (`order_id UNIQUE`). Permissions `custody.read` / `custody.manage` (super admin, operations manager, dispatcher).

### Reports, profit & commission
- Commission is basis points on the **merchandise subtotal** (not delivery): `stores.commission_bps` (default 1000 = 10%). Each order snapshots `orders.commission_bps` at checkout and stores `commission_amount` (generated, rounded half-up), so changing a rate never rewrites history. Only `stores.commission` (super admin) may change a rate.
- Definitions used everywhere (`api/src/modules/admin/reports.admin.ts`): **المبيعات** = Σ subtotal of non-cancelled orders · **عمولة ستايلو** = Σ commission_amount · **مستحقات المتجر** = sales − commission · **إيراد ستايلو** = commission + delivery fees · "realised" = delivered only. Days are Libya calendar days (`Africa/Tripoli`).
- The daily chart follows the dataviz rules: one series in the brand colour, no legend, rounded data-end on the baseline, hover tooltip, «عرض كجدول» table view.

### Numbers in RTL (admin)
- Show numbers through `<Num>`, `<Money>`, `<Phone>`, `<Count>`, `<Percent>` (`admin/src/components/inputs.tsx`) — they isolate digits as LTR and use tabular figures. Phones display as `+218 91 234 5678`.
- Enter numbers through `MoneyInput` (د.ل), `PhoneInput` (+218), `IntInput` (units like قطعة/ساعة), `PercentInput`. They are LTR inside, accept Arabic-Indic digits (٠-٩), and keep raw text; parse with `parseLYD`, `normaliseLibyanPhone`, `parseIntInput`, `parsePercent` before sending. The API also accepts Arabic-Indic digits in phone numbers.
- Forms validate on submit and show the error under the field (`<Field required error>`); required fields carry `*`.

## 6. API rules

- Routes are versioned under `/v1`. Each area = `*.routes.ts` (parse input with zod, call the service) + `*.service.ts` (SQL and business rules). Services take a `Ctx` (`db`, `config`, `userId`, `now`) — never read globals, so tests can inject a clock.
- Errors: throw `AppError` helpers from `src/lib/errors.ts` with an **Arabic, user-safe message**; the global handler returns `{ error: { code, message, details } }`. Zod errors → 400, malformed UUIDs → 400.
- Money is integer dirhams end to end. Never use floats for money.
- Multi-step writes (checkout) run in `withTransaction` and lock the rows they change (`FOR UPDATE`).
- Delivery rules live **only** in `src/modules/delivery/delivery.ts` (pure functions + tests). Fees/hours are config (`EXPRESS_SURCHARGE`, `STANDARD_DELAY_HOURS`, transit hours, …), not literals in SQL.
- **Auth = phone + one-time code** (`src/modules/auth`): `POST /v1/auth/otp/request` → `POST /v1/auth/otp/verify` → opaque bearer token (`Authorization: Bearer …`). Codes: 6 digits, 5 minutes, 5 wrong attempts, 5 codes/phone/hour, 30 s between codes; only hashes are stored (codes peppered with `OTP_PEPPER`, tokens SHA-256). Wrong attempts are recorded **outside** the sign-in transaction (inside, the rollback would erase them = unlimited guesses). New numbers become customers after giving a name; the back office only admits active staff.
- **Messaging = WhatsApp Business Cloud API** (`src/lib/messaging.ts`, `app.messenger`): OTP with an *authentication* template (`WHATSAPP_OTP_TEMPLATE`, body `{{1}}` = code + "copy code" URL button) and order status updates with a *utility* template (`WHATSAPP_ORDER_TEMPLATE`: name, order number, status, store) — sent after checkout, admin status changes and driver actions (`notifyOrderStatus`, fire-and-forget). Providers: `MESSAGING_PROVIDER=whatsapp | sms_http | console`. Every send is logged in `message_log` (never the code). A refused OTP send returns 503 `message_failed`.
- In development the code is also echoed in the response (`devCode`) and shown on screen, even with WhatsApp configured. Production refuses to start without `OTP_PEPPER` and a real provider (`whatsapp` needs `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`). Empty `.env` values count as unset. Tests inject `fetch` into `buildApp` instead of calling Meta.
- `x-user-id` survives **only for tests** (`AUTH_DEV_HEADER=true`, never in production).
- The API also serves the two websites (`src/web.ts`): the customer site (Expo static export, `CUSTOMER_WEB_DIR`) at `/` with dynamic routes like `/product/:id` mapped to `product/[id].html`, and the back office (`ADMIN_WEB_DIR`, Vite `base: '/admin/'`) at `/admin/`. Files are registered at start-up: **restart after every rebuild**.
- **SEO (Google, link previews)** lives in `src/seo.ts`: `/robots.txt`, `/sitemap.xml` (from the DB), and per-URL tags injected into the Expo HTML by `web.ts` (title, description, canonical with `PUBLIC_SITE_URL`, OpenGraph, JSON-LD `Product`/`ClothingStore`/`WebSite`, `<noscript>` summary). Private pages (cart, account, orders, driver, login, shared carts) are `noindex`; unknown products/stores/looks are 404. Indexing only in production (`SEO_INDEXING`). A new public route needs a case in `pageMeta()` and, if listable, in `sitemapXml()`.
- **Production**: `Dockerfile` + `deploy/` (Caddy HTTPS, PostgreSQL, daily backups) — see `docs/DEPLOY.md`. Production refuses to start without an https `PUBLIC_SITE_URL`, `OTP_PEPPER` and a real messaging provider. `TRUST_PROXY` (on in production) and `CORS_ORIGINS` (none needed: same origin). A new database gets its first general manager + default categories with `node dist/scripts/bootstrap.js --phone … --name …` (the dev seed refuses production).
- **Customer addresses («عناويني», `src/modules/users/addresses.service.ts`)**: `/v1/me/addresses` CRUD + `POST …/:id/default`, `PATCH /v1/me` (name), `GET /v1/cities`. The city must be one of `src/lib/cities.ts` (same list as the admin's `LIBYAN_CITIES`): delivery compares store city with customer city. One default per user (partial unique index — clear the old default before setting a new one); the first address is the default; deleting the default promotes the most recently updated one; max 10. The **default address prices delivery** in the cart, product cards and looks, so the app invalidates those queries after any address change; checkout sends the shown `addressId`. Orders snapshot the address (incl. `landmark`, `building`) — editing never rewrites history.
- Every new endpoint gets an integration test in `api/test/`. Run `npm test` from `api/` before declaring work done (needs PostgreSQL; uses `stylo_test`).

## 7. Database rules

- Migrations are **numbered, forward-only, immutable once committed/applied**: `NNNN_short_name.sql`, wrapped in `BEGIN; … COMMIT;`. To change the schema, add a new migration — never edit an applied one. Apply with `npm run db:migrate` (tracked in `schema_migrations`).
- IDs: `UUID DEFAULT gen_random_uuid()`. Timestamps: `TIMESTAMPTZ`. Money: `BIGINT` minor units + `currency CHAR(3)` (default `LYD`). Never floats for money.
- Bilingual text columns: `*_ar` (required) and `*_en` (optional).
- Order lines snapshot product name/SKU/price — never join back to the catalog to show a past order.
- `products.rating_avg / rating_count / sold_count` are denormalised for fast feeds; keep them updated when reviews/orders change.

### Order statuses — exactly six

| # | Value (DB enum `order_status`) | Arabic label |
|---|---|---|
| 1 | `pending` | قيد الانتظار |
| 2 | `confirmed` | مؤكد |
| 3 | `processing` | قيد التجهيز |
| 4 | `shipped` | تم الشحن |
| 5 | `delivered` | تم التسليم |
| 6 | `cancelled` | ملغي |

Allowed transitions (enforced by a DB trigger, mirrored in `mobile/src/constants/orderStatus.ts`):

```
pending    → confirmed | cancelled
confirmed  → processing | cancelled
processing → shipped | cancelled
shipped    → delivered
delivered, cancelled → (terminal)
```

- New orders must start as `pending`. Every change is logged in `order_status_history`. Set `SET LOCAL stylo.actor_id = '<uuid>'` (and optionally `stylo.status_note`) in the transaction to record who made the change.
- Adding/removing/renaming a status requires owner approval and must update: a new migration, `orderStatus.ts`, and this table.

### Multi-vendor model
- `stores` belong to a `users` row with role `vendor`. Products belong to a store. Stores carry delivery settings: `city`, `prep_hours`, `delivery_fee`.
- **Single-store carts (migration 0003)**: `carts(user_id PK, store_id)` binds each user's cart to one store; trigger `cart_items_same_store` (constraint name `cart_single_store`) refuses items from another store, and the cart row is dropped automatically when its last item is removed. The API answers `409 cart_store_conflict` with `details: { currentStore, requestedStore, itemsCount }`; the client repeats the call with `replaceCart: true` only after the customer chooses «ابدئي سلة جديدة».
- Checkout creates **one `orders` row** for the cart's store with `delivery_mode` `fastest` | `standard` (CHECK `orders_delivery_mode_single_store`). `unified` stays in the enum only for historical orders.
- Addresses (migration 0008): `addresses.landmark` (أقرب معلم), `updated_at` + trigger, length CHECK `addresses_lengths`.
- Custody & messaging (migration 0007): `orders.payment_method` (`cod`|`online`, default `cod`) + `cash_collected_at`; `driver_settlements(number from 7001, driver, orders_count, amount_expected, amount_received, difference generated, note, received_by, settled_at)` + `driver_settlement_orders(order_id UNIQUE, amount)`; `message_log`; permissions `custody.read/manage` (super admin, operations, dispatcher) and `finance.view` (super admin); `payouts.read` removed from operations manager.
- Auth & payouts (migration 0006): `otp_codes`, `sessions(app customer|admin)`; `payouts(number, store, period by delivery day, sales, commission, payout_amount generated, status pending|paid, reference)` + `payout_orders(order_id UNIQUE)` — each delivered order is settled once. Permissions `payouts.read` (store owners: their store) and `payouts.manage` (super admin). A pending payout can be cancelled; a paid one is permanent.
- Store panel (migration 0005): roles gained `products.read/write`, `store.profile`, `reports.view`, `stores.commission`; new role `store_owner`; `stores.phone/district/address_line`; `product_variants.position` + one variant per size+colour; `orders.commission_bps` + generated `commission_amount`.
- Back office (migration 0004): `staff_roles(key, name_ar, permissions[], store_scoped)`, `staff_members(user_id, role_key, store_id?, is_active)` (trigger `staff_store_scope`), `drivers(user_id, city, vehicle, status available|busy|offline, is_active)`, `orders.driver_id/assigned_at` with CHECK `orders_shipped_needs_driver`. `user_role` gained `staff` and `driver`.
- Looks: `looks.store_id` + `look_items` (trigger `look_single_store`: products from the look's store only). Shared carts: `shared_carts` (token, `store_id`, 30-day expiry) + `shared_cart_items` (snapshot).

## 8. Local development

```bash
# Database (once)
sudo -u postgres psql -c "CREATE ROLE stylo LOGIN PASSWORD 'stylo';"
sudo -u postgres psql -c "CREATE DATABASE stylo_dev OWNER stylo;"
sudo -u postgres psql -c "CREATE DATABASE stylo_test OWNER stylo;"
sudo -u postgres psql -d stylo_dev -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext;"

# API (terminal 1)
cd api && cp .env.example .env && npm install && npm run db:reset && npm run dev   # http://localhost:4000

# Mobile (terminal 2)
cd mobile && npm install && npx expo start

# Back office (terminal 3) — http://localhost:5174/admin/
cd admin && npm install && npm run dev

# Or everything from one server: both websites + API on http://localhost:4000
npm run install:all && npm run db:reset && npm run build && npm start
```

## 9. Not built yet (next steps)

See `docs/NEXT_STEPS.md` (ordered launch checklist): hosting (HTTPS, backups, monitoring), WhatsApp Business account + approved templates, product photo upload, app-store builds (EAS), online payments, push notifications, driver shortfall follow-up, store switching, audit log, legal pages.
