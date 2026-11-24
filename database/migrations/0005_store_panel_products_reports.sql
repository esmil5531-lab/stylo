-- =====================================================================
-- Stylo (ستايلو) — Migration 0005: store self-management, sizes, commission
--   * New permissions: products.read / products.write (catalog),
--     store.profile (a store edits its own settings), reports.view,
--     stores.commission (set a store's commission rate — Stylo finance only).
--   * New role «مالك المتجر» (store_owner): a store runs its own shop
--     (products, orders, settings, reports) inside the same back office,
--     scoped to its store. Existing single-store owners get it.
--   * Variants: display order + one row per (size, colour) per product.
--   * Orders snapshot the store's commission rate at checkout, so reports
--     stay correct when a rate changes later.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Roles & permissions
-- ---------------------------------------------------------------------
UPDATE staff_roles SET permissions = permissions ||
  ARRAY['products.read','products.write','store.profile','reports.view','stores.commission']
 WHERE key = 'super_admin';

UPDATE staff_roles SET permissions = permissions || ARRAY['products.read','products.write','reports.view']
 WHERE key = 'operations_manager';

UPDATE staff_roles SET permissions = permissions || ARRAY['products.read']
 WHERE key IN ('customer_support', 'dispatcher');

UPDATE staff_roles SET
  description_ar = 'طلبات ومنتجات متجره فقط',
  permissions = permissions || ARRAY['products.read','products.write','reports.view']
 WHERE key = 'store_manager';

INSERT INTO staff_roles (key, name_ar, description_ar, permissions, store_scoped, sort_order) VALUES
  ('store_owner', 'مالك المتجر', 'يدير متجره: المنتجات والمقاسات والطلبات والإعدادات والتقارير',
    ARRAY['dashboard.view','orders.read','orders.update_status','products.read','products.write',
          'store.profile','reports.view'],
    true, 5);
UPDATE staff_roles SET sort_order = 6 WHERE key = 'store_manager';

-- Owners of exactly one store get the store_owner role (if not already staff).
INSERT INTO staff_members (user_id, role_key, store_id, job_title)
SELECT s.owner_id, 'store_owner', s.id, 'مالك المتجر'
  FROM stores s
 WHERE (SELECT count(*) FROM stores s2 WHERE s2.owner_id = s.owner_id) = 1
   AND NOT EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = s.owner_id);

-- ---------------------------------------------------------------------
-- Store profile fields a store can edit itself
-- ---------------------------------------------------------------------
ALTER TABLE stores
  ADD COLUMN phone          TEXT,
  ADD COLUMN district       TEXT,
  ADD COLUMN address_line   TEXT;

-- ---------------------------------------------------------------------
-- Sizes / variants
-- ---------------------------------------------------------------------
ALTER TABLE product_variants ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Number existing variants in their current order.
UPDATE product_variants v SET position = x.rn
  FROM (SELECT id, row_number() OVER (PARTITION BY product_id ORDER BY created_at, sku) AS rn
          FROM product_variants) x
 WHERE x.id = v.id;

-- One variant per size+colour of a product (NULLs compared as empty).
CREATE UNIQUE INDEX product_variants_size_color_uniq
  ON product_variants (product_id, COALESCE(size, ''), COALESCE(color_name_ar, ''));

-- ---------------------------------------------------------------------
-- Commission snapshot on orders
-- Commission applies to the merchandise subtotal (not the delivery fee).
-- Rounded half-up to the nearest dirham.
-- ---------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN commission_bps INTEGER NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 10000);

UPDATE orders o SET commission_bps = s.commission_bps FROM stores s WHERE s.id = o.store_id;

ALTER TABLE orders
  ADD COLUMN commission_amount BIGINT GENERATED ALWAYS AS ((subtotal * commission_bps + 5000) / 10000) STORED;

CREATE INDEX orders_placed_idx ON orders (placed_at);

COMMIT;
