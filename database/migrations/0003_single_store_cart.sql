-- =====================================================================
-- Stylo (ستايلو) — Migration 0003: one store per cart / order
--   * A user's cart belongs to exactly ONE store (`carts.store_id`).
--     Adding an item from another store is refused by the database;
--     the app asks the customer to start a new cart instead.
--   * Shared carts are single-store snapshots.
--   * Looks ("كمّل اللوك") are curated per store, so a whole look can
--     always go into one cart.
--   * Delivery options for a single-store order:
--       'fastest'  أسرع توصيل : priority courier, extra fee
--       'standard' توصيل عادي : regular courier round, store fee only
--     'unified' (توصيل موحد, multi-store consolidation) is retired:
--     it stays in the enum only for historical orders.
-- =====================================================================

-- A value added with ALTER TYPE … ADD VALUE cannot be *used* in the same
-- transaction, so nothing below casts to 'standard' (see the CHECK at the end).
ALTER TYPE delivery_mode ADD VALUE IF NOT EXISTS 'standard';

BEGIN;

-- ---------------------------------------------------------------------
-- Carts: one row per user, bound to one store
-- ---------------------------------------------------------------------
CREATE TABLE carts (
  user_id     UUID PRIMARY KEY REFERENCES users(id)  ON DELETE CASCADE,
  store_id    UUID NOT NULL    REFERENCES stores(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX carts_store_idx ON carts(store_id);
CREATE TRIGGER carts_updated_at BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Existing multi-store carts keep the store of the most recently added item.
INSERT INTO carts (user_id, store_id)
SELECT DISTINCT ON (ci.user_id) ci.user_id, p.store_id
  FROM cart_items ci
  JOIN product_variants v ON v.id = ci.variant_id
  JOIN products p ON p.id = v.product_id
 ORDER BY ci.user_id, ci.added_at DESC;

DELETE FROM cart_items ci
 USING product_variants v, products p, carts c
 WHERE v.id = ci.variant_id AND p.id = v.product_id
   AND c.user_id = ci.user_id AND p.store_id <> c.store_id;

ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_cart_fk FOREIGN KEY (user_id) REFERENCES carts(user_id) ON DELETE CASCADE;

-- Every item must come from the cart's store.
CREATE OR REPLACE FUNCTION cart_items_same_store() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  item_store UUID;
  cart_store UUID;
BEGIN
  SELECT p.store_id INTO item_store
    FROM product_variants v JOIN products p ON p.id = v.product_id
   WHERE v.id = NEW.variant_id;
  SELECT store_id INTO cart_store FROM carts WHERE user_id = NEW.user_id;
  IF item_store IS DISTINCT FROM cart_store THEN
    RAISE EXCEPTION 'cart of user % belongs to store %, item is from store %',
      NEW.user_id, cart_store, item_store
      USING ERRCODE = 'check_violation', CONSTRAINT = 'cart_single_store';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cart_items_same_store
  BEFORE INSERT OR UPDATE OF variant_id, user_id ON cart_items
  FOR EACH ROW EXECUTE FUNCTION cart_items_same_store();

-- An empty cart has no store: drop the cart row when its last item goes.
CREATE OR REPLACE FUNCTION carts_drop_when_empty() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM carts c
   WHERE c.user_id = OLD.user_id
     AND NOT EXISTS (SELECT 1 FROM cart_items ci WHERE ci.user_id = OLD.user_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER cart_items_drop_empty_cart
  AFTER DELETE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION carts_drop_when_empty();

-- ---------------------------------------------------------------------
-- Shared carts: single-store snapshots
-- ---------------------------------------------------------------------
ALTER TABLE shared_carts ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

UPDATE shared_carts sc SET store_id = (
  SELECT p.store_id
    FROM shared_cart_items sci
    JOIN product_variants v ON v.id = sci.variant_id
    JOIN products p ON p.id = v.product_id
   WHERE sci.shared_cart_id = sc.id
   ORDER BY v.sku LIMIT 1);

DELETE FROM shared_carts WHERE store_id IS NULL;
DELETE FROM shared_cart_items sci
 USING product_variants v, products p, shared_carts sc
 WHERE v.id = sci.variant_id AND p.id = v.product_id
   AND sc.id = sci.shared_cart_id AND p.store_id <> sc.store_id;

ALTER TABLE shared_carts ALTER COLUMN store_id SET NOT NULL;

-- ---------------------------------------------------------------------
-- Looks are curated per store
-- ---------------------------------------------------------------------
ALTER TABLE looks ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

UPDATE looks l SET store_id = (
  SELECT p.store_id FROM look_items li JOIN products p ON p.id = li.product_id
   WHERE li.look_id = l.id ORDER BY li.position LIMIT 1);

DELETE FROM looks WHERE store_id IS NULL;
DELETE FROM look_items li
 USING products p, looks l
 WHERE p.id = li.product_id AND l.id = li.look_id AND p.store_id <> l.store_id;

ALTER TABLE looks ALTER COLUMN store_id SET NOT NULL;
CREATE INDEX looks_store_idx ON looks(store_id);

CREATE OR REPLACE FUNCTION look_items_same_store() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT store_id FROM products WHERE id = NEW.product_id)
     IS DISTINCT FROM (SELECT store_id FROM looks WHERE id = NEW.look_id) THEN
    RAISE EXCEPTION 'look % only accepts products from its own store', NEW.look_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'look_single_store';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER look_items_same_store
  BEFORE INSERT OR UPDATE ON look_items
  FOR EACH ROW EXECUTE FUNCTION look_items_same_store();

-- ---------------------------------------------------------------------
-- Orders: new orders use fastest | standard. NOT VALID keeps historical
-- 'unified' orders untouched while checking every new or updated row.
-- (Compared as text: the new enum value cannot be used in this transaction.)
-- ---------------------------------------------------------------------
ALTER TABLE orders
  ADD CONSTRAINT orders_delivery_mode_single_store
  CHECK (delivery_mode::text IN ('fastest', 'standard')) NOT VALID;

-- Offers feed ("عروض"): discounted active products.
CREATE INDEX products_on_sale_idx ON products(store_id)
  WHERE status = 'active' AND compare_at_price > base_price;

COMMIT;
