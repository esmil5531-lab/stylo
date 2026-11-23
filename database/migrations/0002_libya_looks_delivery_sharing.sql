-- =====================================================================
-- Stylo (ستايلو) — Migration 0002
--   * Libyan market: LYD is the default currency.
--     LYD has 3 decimal places: amounts are stored in dirhams
--     (1 د.ل = 1000 dirham), e.g. 199 د.ل => 199000.
--   * Store delivery settings + per-order delivery mode
--     ("أسرع توصيل" = fastest, "توصيل موحد" = unified)
--   * Merchandising: product stats, home banners, "كمّل اللوك" looks
--   * Shareable carts
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Libya defaults
-- ---------------------------------------------------------------------
ALTER TABLE products  ALTER COLUMN currency     SET DEFAULT 'LYD';
ALTER TABLE orders    ALTER COLUMN currency     SET DEFAULT 'LYD';
ALTER TABLE addresses ALTER COLUMN country_code SET DEFAULT 'LY';

-- ---------------------------------------------------------------------
-- Delivery
-- ---------------------------------------------------------------------
CREATE TYPE delivery_mode AS ENUM (
  'fastest',  -- أسرع توصيل : every store ships on its own as soon as it is ready
  'unified'   -- توصيل موحد : all stores are consolidated into one shipment
);

ALTER TABLE stores
  ADD COLUMN city          TEXT    NOT NULL DEFAULT 'طرابلس',
  ADD COLUMN prep_hours    INTEGER NOT NULL DEFAULT 4     CHECK (prep_hours >= 0),
  ADD COLUMN delivery_fee  BIGINT  NOT NULL DEFAULT 10000 CHECK (delivery_fee >= 0),
  ADD COLUMN is_featured   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN logo_text     TEXT,     -- wordmark shown when there is no logo_url (e.g. 'LUNA')
  ADD COLUMN brand_color   CHAR(7) CHECK (brand_color ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE orders
  ADD COLUMN delivery_mode         delivery_mode NOT NULL DEFAULT 'fastest',
  ADD COLUMN estimated_delivery_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------
-- Product merchandising stats (denormalised for fast feeds)
-- ---------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN compare_at_price BIGINT       CHECK (compare_at_price >= 0),
  ADD COLUMN is_featured      BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN sold_count       INTEGER      NOT NULL DEFAULT 0 CHECK (sold_count >= 0),
  ADD COLUMN rating_avg       NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating_avg BETWEEN 0 AND 5),
  ADD COLUMN rating_count     INTEGER      NOT NULL DEFAULT 0 CHECK (rating_count >= 0);

CREATE INDEX products_trending_idx ON products(sold_count DESC) WHERE status = 'active';
CREATE INDEX products_new_idx      ON products(created_at DESC) WHERE status = 'active';
CREATE INDEX stores_featured_idx   ON stores(is_featured) WHERE status = 'active';

-- ---------------------------------------------------------------------
-- Home banners
-- ---------------------------------------------------------------------
CREATE TABLE banners (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar     TEXT    NOT NULL,
  subtitle_ar  TEXT,
  cta_ar       TEXT,
  image_url    TEXT,
  link         TEXT,              -- in-app route, e.g. '/products?feed=new'
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  starts_at    TIMESTAMPTZ,
  ends_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Looks ("كمّل اللوك"): curated outfits made of products,
-- possibly from different stores.
-- ---------------------------------------------------------------------
CREATE TABLE looks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         CITEXT  NOT NULL UNIQUE,
  title_ar     TEXT    NOT NULL,
  subtitle_ar  TEXT,
  cover_url    TEXT,
  is_featured  BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE look_items (
  look_id      UUID    NOT NULL REFERENCES looks(id)    ON DELETE CASCADE,
  product_id   UUID    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (look_id, product_id)
);
CREATE INDEX look_items_product_idx ON look_items(product_id);

-- ---------------------------------------------------------------------
-- Shared carts: an immutable snapshot of a cart, opened by token.
-- ---------------------------------------------------------------------
CREATE TABLE shared_carts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{8,64}$'),
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX shared_carts_owner_idx ON shared_carts(owner_id);

CREATE TABLE shared_cart_items (
  shared_cart_id UUID    NOT NULL REFERENCES shared_carts(id)     ON DELETE CASCADE,
  variant_id     UUID    NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (shared_cart_id, variant_id)
);

COMMIT;
