# CLAUDE.md — ستايلو (Stylo)

This file is the source of truth for every session working on this repo. Read it fully before changing anything. Update it in the same commit whenever a rule here changes.

## 1. Project identity (do not change without explicit owner approval)

| | |
|---|---|
| Name (Arabic) | **ستايلو** |
| Name (Latin) | **Stylo** |
| Official tagline | **كل ستايل في مكان واحد** (exact text — no rewording, no added punctuation) |
| Product | Multi-vendor fashion e-commerce marketplace: many independent stores sell on one platform |
| Primary language | Arabic, RTL. English is secondary/optional |
| Default currency | SAR (stored per row, so other currencies are possible) |

Brand constants live in `mobile/src/constants/brand.ts`. Never hard-code the name or tagline elsewhere.

## 2. Repository layout

```
/
├── CLAUDE.md                  ← this file
├── database/
│   ├── migrations/            ← numbered, forward-only SQL (0001_init.sql, 0002_…)
│   └── seeds/                 ← dev-only data (never run in production)
└── mobile/                    ← Expo app (see mobile/README.md and mobile/AGENTS.md)
    └── src/
        ├── app/               ← Expo Router routes ONLY (every file is a screen)
        ├── components/        ← shared UI components
        ├── constants/         ← brand, order statuses, etc.
        ├── i18n/              ← Arabic strings + RTL setup
        └── theme/             ← colors, spacing, radius, fonts
```

## 3. Tech stack (pinned)

- **Mobile:** Expo **SDK 57** (`expo ~57.0.x`, React Native 0.86, React 19.2), TypeScript strict, Expo Router (file-based, `src/app`).
- **Database:** **PostgreSQL** (16 in dev; 14+ supported). Extensions: `pgcrypto`, `citext`.
- **Font:** Cairo (`@expo-google-fonts/cairo`), loaded in `src/app/_layout.tsx`.
- Do not upgrade the Expo SDK without an explicit request. Expo APIs change every SDK — check the versioned docs at `https://docs.expo.dev/versions/v57.0.0/` instead of relying on memory.

## 4. Mobile rules

### Dependencies
- Add packages with `npx expo install <pkg>` (never plain `npm install`) so versions match SDK 57.
  - If `api.expo.dev` is unreachable (sandboxed environments), use `EXPO_OFFLINE=1 npx expo install <pkg>`; it resolves versions from `expo/bundledNativeModules.json`.
- `react-native-reanimated` / `react-native-worklets` / `react-native-gesture-handler` are pinned explicitly because `expo-router` lists reanimated as an optional peer; without the pin npm picks an incompatible version and installs fail with ERESOLVE.

### Arabic & RTL — mandatory
- The whole app is RTL. Native: forced by the `expo-localization` plugin (`supportsRTL`, `forcesRTL` in `app.json`) plus `ensureRTL()` in `src/i18n/rtl.ts`. Web: `<html lang="ar" dir="rtl">` in `src/app/+html.tsx`.
- **Never** use `textAlign: 'left' | 'right'`, `marginLeft/Right`, `paddingLeft/Right`, `left/right` positioning. Use natural alignment (omit `textAlign`) and logical props: `marginStart/End`, `paddingStart/End`, `start/end`. `flexDirection: 'row'` already follows RTL.
- Directional icons (back arrows, chevrons) must be mirrored in RTL.
- All user-facing text goes in `src/i18n/ar.ts` — no inline Arabic strings in new screens.
- Use `fonts.*` from `@/theme` instead of `fontWeight` (with custom fonts each weight is a separate family).
- Prices: integers in minor units from the API; format for display only (Arabic-locale formatting).

### Code
- Path alias `@/*` → `mobile/src/*`.
- Routes only in `src/app/`; everything else outside it.
- Before declaring work done, run from `mobile/`: `npm run typecheck` and `npm run lint`.
- `ios/` and `android/` are generated (CNG). Never commit or hand-edit them; configure via `app.json` / config plugins.

## 5. Database rules

- Migrations are **numbered, forward-only, immutable once committed/applied**: `NNNN_short_name.sql`, wrapped in `BEGIN; … COMMIT;`. To change the schema, add a new migration — never edit an applied one.
- IDs: `UUID DEFAULT gen_random_uuid()`. Timestamps: `TIMESTAMPTZ`. Money: `BIGINT` minor units + `currency CHAR(3)`. Never floats for money.
- Bilingual text columns: `*_ar` (required) and `*_en` (optional).
- Order lines snapshot product name/SKU/price — never join back to the catalog to show a past order.

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
- `stores` belong to a `users` row with role `vendor`. Products belong to a store.
- One checkout across several stores creates **one `orders` row per store**, sharing a `checkout_id`. Each store moves its own order through the statuses independently.

## 6. Local development

```bash
# Database (once)
sudo -u postgres psql -c "CREATE ROLE stylo LOGIN PASSWORD 'stylo';"
sudo -u postgres psql -c "CREATE DATABASE stylo_dev OWNER stylo;"
sudo -u postgres psql -d stylo_dev -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext;"
psql postgresql://stylo:stylo@localhost:5432/stylo_dev -v ON_ERROR_STOP=1 -f database/migrations/0001_init.sql
psql postgresql://stylo:stylo@localhost:5432/stylo_dev -v ON_ERROR_STOP=1 -f database/seeds/dev_seed.sql

# Mobile
cd mobile && npm install && npx expo start
```

## 7. Not built yet (next steps)

Backend API layer (the app currently uses static demo data), auth, product/store screens, cart & checkout, payments, vendor dashboard, admin panel.
