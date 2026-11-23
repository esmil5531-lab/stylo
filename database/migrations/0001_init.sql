-- =====================================================================
-- Stylo (ستايلو) — "كل ستايل في مكان واحد"
-- Migration 0001: initial multi-vendor fashion e-commerce schema
-- Target: PostgreSQL 14+
-- Conventions:
--   * Primary keys: UUID (gen_random_uuid, pgcrypto)
--   * Money: BIGINT in minor units (e.g. halalas / fils) + ISO-4217 currency
--   * Timestamps: TIMESTAMPTZ, UTC
--   * Bilingual text: *_ar (required) + *_en (optional)
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

-- The six order statuses (fixed — see CLAUDE.md before changing).
CREATE TYPE order_status AS ENUM (
  'pending',     -- قيد الانتظار  : placed, awaiting store confirmation
  'confirmed',   -- مؤكد          : accepted by the store
  'processing',  -- قيد التجهيز   : being prepared / packed
  'shipped',     -- تم الشحن      : handed to the carrier
  'delivered',   -- تم التسليم    : received by the customer (terminal)
  'cancelled'    -- ملغي          : cancelled (terminal)
);

CREATE TYPE user_role      AS ENUM ('customer', 'vendor', 'admin');
CREATE TYPE store_status   AS ENUM ('pending_review', 'active', 'suspended');
CREATE TYPE product_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE payment_status AS ENUM ('unpaid', 'paid', 'refunded', 'failed');

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE,
  phone           TEXT UNIQUE,
  password_hash   TEXT,
  full_name       TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'customer',
  locale          TEXT NOT NULL DEFAULT 'ar',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_contact_chk CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE addresses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label           TEXT,
  recipient_name  TEXT NOT NULL,
  phone           TEXT NOT NULL,
  country_code    CHAR(2) NOT NULL,
  city            TEXT NOT NULL,
  district        TEXT,
  street          TEXT NOT NULL,
  building        TEXT,
  postal_code     TEXT,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user_idx ON addresses(user_id);
CREATE UNIQUE INDEX addresses_one_default_per_user
  ON addresses(user_id) WHERE is_default;

-- ---------------------------------------------------------------------
-- Stores (vendors)
-- ---------------------------------------------------------------------

CREATE TABLE stores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug            CITEXT NOT NULL UNIQUE,
  name_ar         TEXT NOT NULL,
  name_en         TEXT,
  description_ar  TEXT,
  description_en  TEXT,
  logo_url        TEXT,
  cover_url       TEXT,
  status          store_status NOT NULL DEFAULT 'pending_review',
  commission_bps  INTEGER NOT NULL DEFAULT 1000 CHECK (commission_bps BETWEEN 0 AND 10000),
  rating_avg      NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stores_owner_idx ON stores(owner_id);

-- ---------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------

CREATE TABLE categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id       UUID REFERENCES categories(id) ON DELETE SET NULL,
  slug            CITEXT NOT NULL UNIQUE,
  name_ar         TEXT NOT NULL,
  name_en         TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  slug            CITEXT NOT NULL,
  name_ar         TEXT NOT NULL,
  name_en         TEXT,
  description_ar  TEXT,
  description_en  TEXT,
  brand           TEXT,
  base_price      BIGINT NOT NULL CHECK (base_price >= 0),
  currency        CHAR(3) NOT NULL DEFAULT 'SAR',
  status          product_status NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);
CREATE INDEX products_store_idx    ON products(store_id);
CREATE INDEX products_category_idx ON products(category_id);
CREATE INDEX products_active_idx   ON products(status) WHERE status = 'active';

CREATE TABLE product_variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku             TEXT NOT NULL UNIQUE,
  size            TEXT,
  color_name_ar   TEXT,
  color_hex       CHAR(7) CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  price           BIGINT CHECK (price >= 0),          -- NULL => products.base_price
  stock_qty       INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX product_variants_product_idx ON product_variants(product_id);

CREATE TABLE product_images (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  alt_ar          TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX product_images_product_idx ON product_images(product_id, sort_order);

-- ---------------------------------------------------------------------
-- Cart & wishlist
-- ---------------------------------------------------------------------

CREATE TABLE cart_items (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant_id      UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, variant_id)
);

CREATE TABLE wishlist_items (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

-- ---------------------------------------------------------------------
-- Orders
-- A single checkout that spans several stores creates one `orders` row
-- per store, all sharing the same checkout_id. Each store fulfils and
-- moves its own order through the six statuses independently.
-- ---------------------------------------------------------------------

CREATE TABLE orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 100001) UNIQUE,
  checkout_id      UUID NOT NULL,
  customer_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  store_id         UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  status           order_status NOT NULL DEFAULT 'pending',
  payment_status   payment_status NOT NULL DEFAULT 'unpaid',
  currency         CHAR(3) NOT NULL DEFAULT 'SAR',
  subtotal         BIGINT NOT NULL CHECK (subtotal >= 0),
  shipping_fee     BIGINT NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  discount         BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total            BIGINT GENERATED ALWAYS AS (subtotal + shipping_fee - discount) STORED,
  shipping_address JSONB NOT NULL,        -- snapshot at checkout time
  tracking_number  TEXT,
  cancel_reason    TEXT,
  placed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orders_total_nonneg CHECK (subtotal + shipping_fee - discount >= 0)
);
CREATE INDEX orders_customer_idx ON orders(customer_id, placed_at DESC);
CREATE INDEX orders_store_idx    ON orders(store_id, status, placed_at DESC);
CREATE INDEX orders_checkout_idx ON orders(checkout_id);

CREATE TABLE order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id       UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  -- snapshots, so later catalog edits never change past orders
  product_name_ar  TEXT NOT NULL,
  sku              TEXT NOT NULL,
  size             TEXT,
  color_name_ar    TEXT,
  unit_price       BIGINT NOT NULL CHECK (unit_price >= 0),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  line_total       BIGINT GENERATED ALWAYS AS (unit_price * quantity) STORED
);
CREATE INDEX order_items_order_idx ON order_items(order_id);

CREATE TABLE order_status_history (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status      order_status,
  to_status        order_status NOT NULL,
  changed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  note             TEXT,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order_idx ON order_status_history(order_id, changed_at);

-- Allowed transitions between the six statuses.
--   pending    -> confirmed | cancelled
--   confirmed  -> processing | cancelled
--   processing -> shipped | cancelled
--   shipped    -> delivered
--   delivered, cancelled: terminal
CREATE OR REPLACE FUNCTION order_status_can_transition(f order_status, t order_status)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE f
    WHEN 'pending'    THEN t IN ('confirmed', 'cancelled')
    WHEN 'confirmed'  THEN t IN ('processing', 'cancelled')
    WHEN 'processing' THEN t IN ('shipped', 'cancelled')
    WHEN 'shipped'    THEN t = 'delivered'
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION orders_status_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'new orders must start as pending (got %)', NEW.status;
    END IF;
    INSERT INTO order_status_history(order_id, from_status, to_status)
    VALUES (NEW.id, NULL, NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT order_status_can_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'invalid order status transition: % -> %', OLD.status, NEW.status;
    END IF;
    INSERT INTO order_status_history(order_id, from_status, to_status, changed_by, note)
    VALUES (NEW.id, OLD.status, NEW.status,
            NULLIF(current_setting('stylo.actor_id', true), '')::uuid,
            NULLIF(current_setting('stylo.status_note', true), ''));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_status_guard_ins AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_status_guard();
CREATE TRIGGER orders_status_guard_upd BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_status_guard();

-- ---------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------

CREATE TABLE reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_item_id    UUID REFERENCES order_items(id) ON DELETE SET NULL,
  rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------

CREATE TRIGGER users_updated_at    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER stores_updated_at   BEFORE UPDATE ON stores   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_updated_at   BEFORE UPDATE ON orders   FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
