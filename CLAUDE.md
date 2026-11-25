# CLAUDE.md — ستايلو (Stylo)

This file is the source of truth for every session working on this repo. Read it fully before changing anything. Update it in the same commit whenever a rule here changes.

## 1. Project identity (do not change without explicit owner approval)

| | |
|---|---|
| Name (Arabic) | **ستايلو** |
| Name (Latin) | **STYLO** (wordmark: Cinzel capitals, wide tracking, deep navy) |
| Official tagline | **كل ستايل في مكان واحد** — main Arabic tagline (exact text — no rewording, no added punctuation) |
| English descriptor | **MORE THAN FASHION** — next to/under the logo (always capitals, wide tracking) |
| Product | Multi-vendor fashion e-commerce marketplace: many independent stores sell on one platform |
| Market | **Libya** (LY). Default city for estimates: طرابلس |
| Currency | **Libyan dinar, LYD, shown as «د.ل»** (e.g. `199 د.ل`). LYD has **3 decimals**: money is stored in **dirhams** (1 د.ل = 1000), so 199 د.ل = `199000` |
| Primary language | Arabic, RTL. English is secondary/optional |
| Visual identity | **Owner-approved STYLO brand (navy)** — read `brand/BRAND_GUIDELINES.md`. Logo: «S» monogram crossed by two parallel 47° blades + STYLO + MORE THAN FASHION (`brand/logo/`). Colours: **Deep Navy `#0B1F2E`** (primary), **Muted Teal `#355E5A`** (secondary; «يصلك اليوم» badges), **Soft Ivory `#F8F6F1`** (backgrounds), **Brushed Silver `#C9C9C9`** (logo/lines on navy only). Single source: `brand/tokens.json`. Global, premium, minimal — do not invent a different look, never use the reference boards' dollar prices or model photos as content |

Brand constants live in `mobile/src/constants/brand.ts`. Never hard-code the name or tagline elsewhere.

> **Identity (owner decision, Nov 2026):** the old burgundy look (`#5B0E2D`, Cairo, pink hero) is retired everywhere. `brand/tokens.json` is the single source: `node brand/scripts/build-tokens.mjs` generates `mobile/src/theme/tokens.ts` (read by `mobile/src/theme/index.ts`) and `admin/src/tokens.css` (`--stylo-*`, mapped in `admin/src/styles.css`). Never hard-code a brand hex in a screen. Navy surfaces (hero, login, onboarding) use the generated navy fabric (`brand/textures/`, `build_textures.py`) — never photos of people. Category tile tints moved to the palette in migration 0013. Garment colour names (e.g. «عنابي» in `admin/src/lib/sizes.ts`) are product data, not identity.

### Core features (must keep working)
- **One store per cart and per order** (owner decision). A cart holds items from a single store. Adding an item from another store shows a dialog with two choices: «ابدئي سلة جديدة من …» (empties the cart and rebinds it) or «الإبقاء على سلتي الحالية». Never mix stores in a cart, order, shared cart or look.
- **Home tabs** — «لأجلك · ترند · عروض · قريب منك». «عروض» = discounted products only (`compare_at_price > base_price`), biggest discount first, with a «-23%» badge.
- **كمّل اللوك** — looks are curated **per store** so the whole look fits one cart; shown on home, on product pages (same store) and as a look page with «add the whole look to cart».
- **Delivery choice (one parcel)** — «أسرع توصيل» (priority courier; store fee + `EXPRESS_SURCHARGE`) vs «توصيل عادي» (next regular round; store fee only, + `STANDARD_DELAY_HOURS`). «توصيل موحد» (multi-store) is retired and only appears on old orders.
- **Cart sharing** — single-store snapshot link `…/shared-cart/<token>`; the recipient can view it and add everything to their own cart (same store rule applies).
- **Driver mode («لوحة المندوب»)** — inside the same mobile app at `/driver` for users with role `driver` (they land there after sign-in): status, cash **in custody** and cash **still to collect** (`toCollect`), orders grouped by next step («في الطريق إلى الزبون» shipped → «جاهزة للاستلام من المتجر» processing → «بانتظار تجهيز المتجر» confirmed; express first), each card with the current stop first, call / WhatsApp / map buttons, the nearest landmark highlighted, the full item list and the amount to collect. «استلمت الطلب من المتجر» (processing → shipped) and «تم التسليم واستلام X د.ل» (shipped → delivered + cash collected) both ask for confirmation. **«تعذّر التسليم»** (shipped → cancelled) needs a reason from the owner-approved list (`no_answer` الزبون لا يرد · `refused` رفض الاستلام · `wrong_address` عنوان غير صحيح · `postponed` تأجيل من الزبون, `api/src/modules/orders/delivery-failure.ts`) + optional note; items go back to stock, no cash, the reason is in the order history, and the order shows under «أعِد إلى المتجر» for the day. Today's deliveries are a compact list. No banners on this screen. Driver endpoints are only called once `/v1/me` says the role is `driver`; other accounts see «هذا الحساب ليس حساب مندوب».
- **Guests & sign-in (Phase B)** — browsing, cart, ♡ and cart sharing work **without an account**: the first add creates an anonymous guest (`users.role = 'guest'`, no phone; `POST /v1/auth/guest`, per-IP limit). The WhatsApp code is asked only at «إتمام الطلب» / «حسابي» / orders, and **once per device**: customers get a 24 h access token + a 180-day rotating refresh token (stored in SecureStore with the access token as one JSON value, `lib/session.ts`); the client renews silently before expiry and on 401 (`refreshSession()` single-flight in `api/client.ts`). Signing in from a guest session merges its cart (guest cart replaces another store's cart; same store adds up within stock) and ♡ into the account and deletes the guest. A rotated refresh token replayed after 60 s revokes the session. Idle guests are purged after 30 days (`server.ts`). Services use `requireAccount(ctx)` (guests → 401 `sign_in_required`) for checkout, orders, addresses, profile, notifications; `requireUser` for cart/♡.
- **Customer order cancel** — while `pending` only (`POST /v1/orders/:id/cancel`), restocks, history «ألغته الزبونة». **Checkout price guard** — the app sends `expectedTotal` (what she saw); a different total → 409 `price_changed` and the cart refreshes.
- **Account deletion & legal** — «حذف الحساب» (`DELETE /v1/me`, `app/delete-account.tsx`): erases name, phone, addresses, cart, ♡, shared carts, reviews, OTP codes, message log, sessions; keeps the user row as «حساب محذوف» (`deleted_at`) and scrubs past orders' addresses to the city. Refused with active orders and for staff/vendor/driver roles. Legal pages `/legal/terms|privacy|returns` (`app/legal/[page].tsx`, text in `src/i18n/legal.ar.ts` — **draft for the owner's legal review**), public + in the sitemap; «تواصل معنا» shows when `EXPO_PUBLIC_SUPPORT_WHATSAPP` is set.
- **Product lists & search (Phase D)** — `GET /v1/products` returns `{ items, total, hasMore }` (pages of 20 in the app, `useProductPages`, next page on scroll) with `sort` (`newest | price_asc | price_desc | discount | popular`; without it each feed keeps its order), `sizes=M,L` (in stock), `minPrice/maxPrice` (dirhams). `GET /v1/products/facets` gives the sizes in stock (natural order: S, M, L…, then numbers) and the price range for the filter sheet («ترتيب» / «فلترة» bottom sheets, `components/product/ListControls.tsx`). Search: every word must match the product, brand, store **or category** name, Arabic-insensitive (أ/إ/آ → ا, ة → ه, ى → ي, no harakat: `normaliseSearch` + the same `translate()` in SQL). Customers never see empty categories (`GET /v1/categories` drops those with no product on sale; the back office still lists them).
- **Reviews («التقييمات», migration 0014)** — only a customer who **received** the product (delivered order) can rate it: 1–5 stars + optional text (≤ 500), one per product, editable/deletable (`PUT|DELETE /v1/products/:id/reviews/mine`; list `GET …/reviews` with summary, distribution, `mine`, `canReview`). The author shows as «first name + initial», never the phone. `products.rating_avg/count` are recomputed from visible reviews on every change (`refreshProductRating`). Moderation is Stylo's (`reviews.manage`: super admin, operations — never stores): «التقييمات» page in the back office hides/shows a review. Cards hide the stars when a product has no reviews (no «0.0»). Delivered orders show «قيّمي» next to each item.
- **Driver cash custody («عُهدة المناديب»)** — orders are cash on delivery; the cash a driver collects stays in their custody until staff close it («تقفيل العُهدة») in the back office, recording amount received, time and receiving employee. Custody then resets to zero.

### Colors & contrast
- Body/secondary text must meet WCAG AA (≥ 4.5:1): use `ink` (navy), `inkSecondary` or `inkMuted`. `inkFaint` (3.0:1) is only for icons, disabled controls and decoration — never for text people must read. `silver` is for text/lines **on navy only** (1.5:1 on ivory).
- White text only on `primary` / `primaryDark` / `secondary` / `sale` / `success`. Screens are ivory (`background`), cards white (`surface`), fields/chips sand (`surfaceMuted`). «يصلك اليوم/غداً» badges and delivery ETAs use `secondary` (teal) on `secondarySoft`. Buttons: 4 px corners (`radius.sm`), navy fill or 1 px navy outline; feed tabs are underlined, not pills. Contrast ratios are documented at the top of `theme/index.ts` and in `brand/tokens.json`; re-check them when changing a colour.

## 2. Repository layout

```
/
├── CLAUDE.md                  ← this file
├── brand/                     ← STYLO identity: logo (SVG/PNG), icons, splash, fonts, tokens.json, BRAND_GUIDELINES.md, scripts/
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
- **Fonts:** **IBM Plex Sans Arabic** 400/500/600/700 (all UI text; `fonts.extraBold` = 700, Plex has no 800), **Cinzel** 500 (STYLO and store wordmarks), **Playfair Display** 400 (English editorial titles only) — loaded in `src/app/_layout.tsx` (`@expo-google-fonts/*`) and in the admin via `@fontsource/*`. Montserrat is used only inside the outlined logo files. Files + OFL licences in `brand/fonts/`.
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
- Use `fonts.*` from `@/theme` instead of `fontWeight` (with custom fonts each weight is a separate family). Give Arabic labels a `lineHeight` (the tab bar renders its own label for this reason).
- Prices arrive as integers in minor units; always display with `formatPrice()` from `src/lib/format.ts` → `199 د.ل`.

### Data & navigation
- All server calls go through `src/api/hooks.ts` (React Query). Screens render loading / error-with-retry through `<QueryState>`; mutation errors show `errorMessage(err)` (the API's Arabic message).
- Cart mutations return the whole cart and write it into the `['cart']` cache — don't refetch manually.
- Anything that adds to the cart (product, look, shared cart) must go through `useStoreConflictGuard()` (`components/cart/StoreConflictDialog.tsx`) so a store conflict opens the two-choice dialog instead of an error.
- API URL (`src/api/client.ts`): native = `EXPO_PUBLIC_API_URL` from `mobile/.env` (see `mobile/.env.example`; e.g. `http://<LAN IP>:4000/v1`), else the Metro host on port 4000 (LAN mode — a tunnel does not carry the API). **Web always uses its own origin** and ignores the variable, so a phone setting can never leak into the website build. In dev the network error shows the URL that failed and Metro logs `[stylo] API: …`.
- In SDK 57, `<Link asChild>` throws if the child gets an **array** style. Use `Pressable` + `router.push(...)` for styled tappable cards.
- **Notifications («الإشعارات»)**: the home bell opens `/notifications`, built from `GET /v1/me/notifications` (the customer's `order_status_history`, newest first; the note is shown only for cancellations). Read state is per device (`lib/notificationsSeen.ts`); on first use only the last 48 h count as new. The bell shows the unread count like the cart badge.
- Unknown links render `src/app/+not-found.tsx` (Arabic, branded; the server answers 404 with it). Expo's `_sitemap.html` is never served.
- **Onboarding** (`src/app/onboarding.tsx`): three slides on navy fabric with the reversed logo (no people), shown **once on the app's first launch** (`lib/onboarding.ts`, SecureStore flag; the home screen redirects); never on the website (reachable at `/onboarding`, `noindex`). Brand artwork used by screens lives in `mobile/assets/brand/` (installed by `render.mjs`).
- Icon, adaptive icon (navy background), splash (`expo-splash-screen`: navy `#0B1F2E` + silver monogram, STYLO, Arabic tagline, MORE THAN FASHION) and favicon in `mobile/assets/` are **generated** from `brand/` — never edit them by hand: `python brand/scripts/build_logo.py && node brand/scripts/render.mjs` (also installs `admin/public/favicon.svg` + `apple-touch-icon.png`).
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
- A page opened by URL without its menu permission shows «ليست لديك صلاحية» and sends no requests (`canOpen` in `components/Layout.tsx`, same permission as `NAV`); the API remains the guard.
- No privilege escalation: nobody can grant or edit a role with permissions they don't hold, and nobody can deactivate or re-role themselves.
- Order status changes go through `changeOrderStatus` (sets `stylo.actor_id` so history records who did it). `shipped` requires an assigned driver (also a DB CHECK). Cancelling requires a reason and restocks the items (`orders/restock.ts`, shared by every cancel path). Cancelling a **shipped** order = failed delivery: Stylo staff only (stores get no next status once shipped) and `failureReason` is required (also enforced by the DB trigger). Driver status follows automatically: `busy` while they have a shipped order, `available` after.
- Update (PATCH) schemas must not contain zod `.default()`s — `.partial()` keeps defaults and would silently reset fields the client didn't send. Defaults belong on create schemas only.
- Money inputs are typed in د.ل by staff and sent to the API in dirhams (`parseLYD` in `admin/src/lib/format.ts`).
- Order numbers next to Arabic text must be direction-isolated: `<OrderNo>` in admin, `\u2066…\u2069` in mobile strings — otherwise "#100001" renders as "100001#".
- The back office shows the logo (`admin/public/brand/`, installed by `render.mjs`) with a **STYLO ADMIN** badge for Stylo staff and **STYLO STORE** for a store's team; the login page sits on the navy fabric.
- Staff and store owners sign in with their phone + one-time code (`admin/src/pages/Login.tsx`, `app: 'admin'`). Only active `staff_members` get in; the back office never creates accounts. The token lives in localStorage and admin sessions last 12 hours. Change user ⇒ the query cache is cleared **during render** (never in an effect: that cancels the first requests and leaves screens spinning).

### Store panel (لوحة المتجر)
- Stores manage themselves **inside the same back office**, scoped to their store: role `store_owner` («مالك المتجر», products + orders + settings + reports) and `store_manager`. Creating a store gives its owner `store_owner` automatically. One staff account = one store (an owner of several stores needs separate accounts until store switching exists).
- A store edits its own profile at `/my-store` (names, logo text, phone, district, address, prep hours). **Delivery fee, status and commission are Stylo decisions** (Stylo runs the drivers) and are read-only there.
- Store staff can never mark products «مميز»; `isFeatured` from store staff is ignored.

### Products & sizes
- Sizes/colours are `product_variants` rows: one per (size, colour) — unique index `product_variants_size_color_uniq` — each with its own stock and optional price override, ordered by `position` (the order the store picked). Products without sizes have one variant with `size = NULL` («مقاس واحد»).
- The product form (`admin/src/pages/ProductForm.tsx`) builds the size × colour matrix from presets in `admin/src/lib/sizes.ts`; SKUs are generated (`<STORE3>-<6 hex>`) when left empty. Saving sends all variants: listed ids are updated, new ones inserted, missing ones deleted (past orders keep their snapshot).
- Customers pick size and colour separately (`mobile/src/components/product/VariantPicker.tsx`); a sold-out size gets a «نفد» caption — never a strike-through (it turns "L" into "Ł").

### Categories (الأقسام)
- Two levels only: main categories (نساء، رجال، أطفال، حقائب، أحذية، إكسسوارات، ساعات، عناية وجمال) and sub-categories under them (trigger `categories_two_levels`). The default tree comes from **migration 0009** (`ON CONFLICT DO NOTHING`; main categories keep ids `2000…0001-0008`, which the dev seed uses); the dev seed no longer truncates categories.
- Each category: `name_ar/en`, `slug` (lowercase-dashes, auto from the English name, sub-categories prefixed by the parent slug), `icon` (MaterialCommunityIcons name from `api/src/lib/category-icons.ts` = `admin/src/lib/categoryIcons.ts`), `color` (tile tint), optional `image_url`, `is_active`, `sort_order` within its parent.
- Customers (`GET /v1/categories`) get the **visible tree** (hidden category ⇒ hidden sub-categories; categories with no product on sale are left out). `?category=<main slug>` lists the main category's and its visible sub-categories' products; counts match what is listed. Product cards keep `category` = main slug and get `categoryIcon` for the placeholder tile.
- Back office «الأقسام» (`categories.manage`: super admin, operations): add/edit, show/hide, ▲▼ order, delete only when empty (no products, no sub-categories). Store staff read visible categories only; a product cannot be filed in a hidden category (keeping its current one is allowed).

### Home banners & looks (البنرات و«كمّل اللوك»)
- **Banners** (`api/src/modules/admin/banners.admin.ts`, `banners.manage`: super admin + operations): the app shows the first **5 live** banners in `sort_order`; live = shown and inside the optional `starts_at`…`ends_at` window (states: live / scheduled / expired / hidden). The link must open a screen **inside the app** (`BANNER_LINK` = CHECK `banners_link_in_app`: `/products?…`, `/store/…`, `/look/…`, `/product/<id>`, `/categories`); the back office builds it from pickers, never a typed URL.
- **Looks** (`looks.admin.ts`, `looks.manage`: Stylo staff + store owners/managers for **their store only**): 2–8 different products of the look's store (also trigger `look_single_store`); only Stylo staff set `is_featured` (home screen) or reorder. Customers see a look only while shown, store active and **≥ 2 pieces on sale** (`MIN_VISIBLE_ITEMS` in `looks.service.ts`) — archived products drop out instead of leaving a half-empty look.

### Photos (رفع الصور — migration 0011)
- `POST /v1/admin/uploads?purpose=product|banner|look|category` takes the **raw image** as the body (`content-type: image/*`, max `MEDIA_MAX_MB`, default 10). Permission follows the purpose (`products.write`, `banners.manage`, `looks.manage`, `categories.manage`); store staff uploads are tagged with their store in `media`.
- `api/src/lib/media.ts`: sharp checks it is a real image (by its bytes, min side 200 px), `rotate()`s it upright, drops EXIF/GPS and stores WebP at **320 / 800 / 1600** px as `<purpose>/<yyyy>/<mm>/<uuid>-<w>.webp`. The DB keeps the 1600 URL; `mediaVariant(url, 800)` gives another size (product cards, cart, looks and categories send 800; the product page and banners keep 1600). External http(s) links still work unchanged.
- Storage (`MEDIA_STORAGE`): `local` = `UPLOADS_DIR` (default `<repo>/uploads`, gitignored; Docker volume `uploads`), served at `/uploads/` with a 1-year immutable cache — only `.webp` files; `supabase` = public Storage bucket (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, server-only). Tests inject `mediaFetch` and a temp `UPLOADS_DIR`.
- Uploads are sniffed by their first bytes (JPEG, PNG, WebP, GIF, AVIF/HEIF) **before** sharp decodes them, so SVG/TIFF/PDF never reach their decoders. Keep `sharp` and `@fastify/static` current (`npm audit --omit=dev` in `api/`): both handle untrusted input.
- Image fields accept only `/uploads/…-(320|800|1600).webp` or http(s) (`isMediaUrl`, = `isImageUrl` in `admin/src/lib/media.ts`). Admin uses `<ImageUpload>` (one photo) and `<ImageGallery>` (products: up to 8, first = main, ▶◀ order) from `admin/src/components/ImageUpload.tsx`, with «أو لصق رابط» as fallback.
- Mobile: relative `/uploads/…` URLs go through `mediaUrl()` (`src/api/client.ts`) so the phone loads them from the API server; `ProductImage`, `HeroCarousel`, `StoreAvatar` already do. Any new `<Image>` of server data must too.

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
- Fastify's own client errors (bad JSON, empty body, 413, 415) are answered in Arabic via `FASTIFY_ERRORS` in `app.ts` — never forward English framework messages.
- Errors: throw `AppError` helpers from `src/lib/errors.ts` with an **Arabic, user-safe message**; the global handler returns `{ error: { code, message, details } }`. Zod errors → 400, malformed UUIDs → 400.
- Money is integer dirhams end to end. Never use floats for money.
- Multi-step writes (checkout) run in `withTransaction` and lock the rows they change (`FOR UPDATE`).
- Delivery rules live **only** in `src/modules/delivery/delivery.ts` (pure functions + tests). Fees/hours are config (`EXPRESS_SURCHARGE`, `STANDARD_DELAY_HOURS`, transit hours, …), not literals in SQL.
- **Auth = phone + one-time code** (`src/modules/auth`): `POST /v1/auth/otp/request` → `POST /v1/auth/otp/verify` → opaque bearer token (`Authorization: Bearer …`). Codes: 6 digits, 5 minutes, 5 wrong attempts, 5 codes/phone/hour, 30 s between codes, `OTP_MAX_PER_IP_HOUR` (default 30 — generous because Libyan carriers share IPs) code requests per IP (`lib/rate-limit.ts`, in memory: one app process); only hashes are stored (codes peppered with `OTP_PEPPER`, tokens SHA-256). Wrong attempts are recorded **outside** the sign-in transaction (inside, the rollback would erase them = unlimited guesses). New numbers become customers after giving a name; the back office only admits active staff.
- **Messaging = WhatsApp Business Cloud API** (`src/lib/messaging.ts`, `app.messenger`): OTP with an *authentication* template (`WHATSAPP_OTP_TEMPLATE`, body `{{1}}` = code + "copy code" URL button) and order status updates with a *utility* template (`WHATSAPP_ORDER_TEMPLATE`: name, order number, status, store) — sent after checkout, admin status changes and driver actions (`notifyOrderStatus`, fire-and-forget). Providers: `MESSAGING_PROVIDER=whatsapp | sms_http | console`. Every send is logged in `message_log` (never the code). A refused OTP send returns 503 `message_failed`.
- In development the code is also echoed in the response (`devCode`) and shown on screen, even with WhatsApp configured. Production refuses to start without `OTP_PEPPER` and a real provider (`whatsapp` needs `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`). Empty `.env` values count as unset. Tests inject `fetch` into `buildApp` instead of calling Meta.
- `x-user-id` survives **only for tests** (`AUTH_DEV_HEADER=true`, never in production).
- The API also serves the two websites (`src/web.ts`): the customer site (Expo static export, `CUSTOMER_WEB_DIR`) at `/` with dynamic routes like `/product/:id` mapped to `product/[id].html`, and the back office (`ADMIN_WEB_DIR`, Vite `base: '/admin/'`) at `/admin/`. Customer pages are re-read when their file changes and `/_expo/*`, `/assets/*` are looked up per request, so a customer rebuild needs no restart; the back office is registered at start-up (**restart after rebuilding admin**). Some machines (seen on Windows) export pages without their bundle `<script>` tags (a ~500-byte `index.html`): `npm run build:customer` runs `mobile/scripts/fix-web-export.mjs` after `expo export` to add them to the files, and the server does the same at request time (`ensureBundleScript`) — always `__expo-metro-runtime-*` → `__common-*` → `entry-*` (split builds need the runtime and common chunk first; route chunks load on demand), a build with no bundle shows the «غير مكتمل» page instead of a blank one, and `GET /__stylo/site` (development only) reports what the server sees. `npm run check:site [-- <base url>]` (`scripts/check-site.mjs`, fetch only) checks a running server end to end: `/health` + database, every customer route (real ids from `/v1`) with its bundles, the 404s, SEO files, `/admin/` + assets, key `/v1` endpoints. Expo Router's built-in `/_sitemap` (a list of every route file) is overridden by `src/app/_sitemap.tsx` = the 404 page. Without `CUSTOMER_WEB_DIR`/`ADMIN_WEB_DIR` the folders default to `mobile/dist` and `admin/dist` in the repo (not in tests); a site that is not built gets a branded Arabic «not built yet» page (503, build command in development, neutral text in production) instead of a 404, and `/v1` keeps answering.
- **SEO (Google, link previews)** lives in `src/seo.ts`: `/robots.txt`, `/sitemap.xml` (from the DB), and per-URL tags injected into the Expo HTML by `web.ts` (title, description, canonical with `PUBLIC_SITE_URL`, OpenGraph, JSON-LD `Product`/`ClothingStore`/`WebSite`, `<noscript>` summary). Private pages (cart, account, orders, driver, login, shared carts) are `noindex`; unknown products/stores/looks are 404. Indexing only in production (`SEO_INDEXING`). A new public route needs a case in `pageMeta()` and, if listable, in `sitemapXml()`.
- **Production**: `Dockerfile` + `deploy/` (Caddy HTTPS, PostgreSQL, daily backups) — see `docs/DEPLOY.md`. Production refuses to start without an https `PUBLIC_SITE_URL`, `OTP_PEPPER` and a real messaging provider. `TRUST_PROXY` (on in production) and `CORS_ORIGINS` (none needed: same origin). A new database gets its first general manager + default categories with `node dist/scripts/bootstrap.js --phone … --name …` (the dev seed refuses production).
- **Customer addresses («عناويني», `src/modules/users/addresses.service.ts`)**: `/v1/me/addresses` CRUD + `POST …/:id/default`, `PATCH /v1/me` (name), `GET /v1/cities`. The city must be one of `src/lib/cities.ts` (same list as the admin's `LIBYAN_CITIES`): delivery compares store city with customer city. One default per user (partial unique index — clear the old default before setting a new one); the first address is the default; deleting the default promotes the most recently updated one; max 10. The **default address prices delivery** in the cart, product cards and looks, so the app invalidates those queries after any address change; checkout sends the shown `addressId`. Orders snapshot the address (incl. `landmark`, `building`) — editing never rewrites history.
- **Database connection** (`src/lib/database.ts`): `createPool(config.database)`; SSL is decided by `DATABASE_SSL` (disable|require|verify, `DATABASE_CA_FILE` for verify) or automatically (local → off, Supabase/Neon/RDS → encrypted); `sslmode` is stripped from the URL because pg ≥ 8.13 treats `require` as full verification. Supabase must use the **Session pooler** URL (direct `db.<ref>.supabase.co` is IPv6-only → ENOTFOUND). Unreachable-database errors become **503 `database_unavailable`** with the cause in development (`diagnoseDbError`), `/health` reports it, the server logs it at start-up, and `npm run db:check` walks DNS → connection → migrations → data. Scripts resolve paths with `fileURLToPath` (Windows). Guide: `docs/SUPABASE.md`.
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
shipped    → delivered | cancelled   (cancelled = failed delivery, orders.delivery_failure required — migration 0012)
delivered, cancelled → (terminal)
```

- New orders must start as `pending`. Every change is logged in `order_status_history`. Set `SET LOCAL stylo.actor_id = '<uuid>'` (and optionally `stylo.status_note`) in the transaction to record who made the change.
- Adding/removing/renaming a status requires owner approval and must update: a new migration, `orderStatus.ts`, and this table.

### Multi-vendor model
- `stores` belong to a `users` row with role `vendor`. Products belong to a store. Stores carry delivery settings: `city`, `prep_hours`, `delivery_fee`.
- **Single-store carts (migration 0003)**: `carts(user_id PK, store_id)` binds each user's cart to one store; trigger `cart_items_same_store` (constraint name `cart_single_store`) refuses items from another store, and the cart row is dropped automatically when its last item is removed. The API answers `409 cart_store_conflict` with `details: { currentStore, requestedStore, itemsCount }`; the client repeats the call with `replaceCart: true` only after the customer chooses «ابدئي سلة جديدة».
- Checkout creates **one `orders` row** for the cart's store with `delivery_mode` `fastest` | `standard` (CHECK `orders_delivery_mode_single_store`). `unified` stays in the enum only for historical orders.
- Guests, refresh tokens, deletion, failed delivery (migration 0012): `user_role` + `guest`; `users.deleted_at`; `users_contact_chk` allows guests/deleted; **`users_phone_format`** (`+2189[1-5]XXXXXXX`, NOT VALID = new rows) so one number = one account; `sessions.refresh_hash/refresh_expires_at/previous_refresh_hash/refreshed_at`; `orders.delivery_failure` (+ CHECK only when cancelled) and the shipped → cancelled transition.
- Media (migration 0011): `media(purpose, store_id, storage, key UNIQUE, url, width, height, bytes, created_by)` — one row per upload.
- Reviews (migration 0014): `reviews.updated_at`, `is_hidden` + `hidden_by`, CHECK `reviews_body_length` (≤ 500), indexes; permission `reviews.manage` (super admin, operations manager).
- Category colours (migration 0013): the default tree's tile tints mapped from the burgundy palette to the STYLO palette (exact old values only).
- Banners & looks (migration 0010): `banners/looks.updated_at` + `created_by`, length checks, `banners_link_in_app`, `banners_window`, `looks_slug_format`; permissions `banners.manage`, `looks.manage`.
- Categories (migration 0009): `categories.icon/color/image_url/is_active/created_at/updated_at`, checks on icon/colour/slug/name, two-level trigger, default tree, permission `categories.manage`.
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

See `docs/NEXT_STEPS.md` (ordered launch checklist): hosting (HTTPS, backups, monitoring), WhatsApp Business account + approved templates, app-store builds (EAS), online payments, push notifications, driver shortfall follow-up, store switching, audit log, legal pages.
