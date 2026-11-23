-- =====================================================================
-- Stylo (ستايلو) — Migration 0004: back-office (لوحة الإدارة)
--   * Staff roles with permission lists, staff members (platform-wide or
--     scoped to one store), drivers and their availability.
--   * Orders can be assigned to a driver.
-- Permissions are plain strings checked by the API (api/src/modules/admin/
-- permissions.ts is the source of truth for the allowed keys).
-- =====================================================================

-- New user kinds. Not used elsewhere in this migration (a value added by
-- ADD VALUE cannot be used in the same transaction).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'driver';

BEGIN;

-- ---------------------------------------------------------------------
-- Roles & permissions
-- ---------------------------------------------------------------------
CREATE TABLE staff_roles (
  key          TEXT PRIMARY KEY CHECK (key ~ '^[a-z_]{2,40}$'),
  name_ar      TEXT   NOT NULL,
  description_ar TEXT,
  permissions  TEXT[] NOT NULL DEFAULT '{}',
  -- Store-level roles must be attached to a store (see staff_members check).
  store_scoped BOOLEAN NOT NULL DEFAULT false,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

INSERT INTO staff_roles (key, name_ar, description_ar, permissions, store_scoped, sort_order) VALUES
  ('super_admin', 'مدير عام', 'كل الصلاحيات',
    ARRAY['dashboard.view','stores.read','stores.write','staff.read','staff.write',
          'drivers.read','drivers.write','orders.read','orders.update_status','orders.assign_driver'],
    false, 1),
  ('operations_manager', 'مدير عمليات', 'الطلبات والسائقين والمتاجر',
    ARRAY['dashboard.view','stores.read','stores.write','drivers.read','drivers.write',
          'orders.read','orders.update_status','orders.assign_driver'],
    false, 2),
  ('dispatcher', 'منسق توصيل', 'إسناد الطلبات للسائقين ومتابعة الشحن',
    ARRAY['dashboard.view','drivers.read','drivers.write','orders.read','orders.update_status','orders.assign_driver'],
    false, 3),
  ('customer_support', 'خدمة العملاء', 'متابعة الطلبات دون تعديلها',
    ARRAY['dashboard.view','stores.read','orders.read'],
    false, 4),
  ('store_manager', 'مدير متجر', 'طلبات متجره فقط: تأكيدها وتجهيزها',
    ARRAY['dashboard.view','orders.read','orders.update_status'],
    true, 5);

-- ---------------------------------------------------------------------
-- Staff members (a user who works on Stylo or for one store)
-- ---------------------------------------------------------------------
CREATE TABLE staff_members (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role_key    TEXT NOT NULL REFERENCES staff_roles(key) ON UPDATE CASCADE,
  -- NULL = platform staff; set = works for this store only.
  store_id    UUID REFERENCES stores(id) ON DELETE CASCADE,
  job_title   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX staff_members_store_idx ON staff_members(store_id) WHERE store_id IS NOT NULL;
CREATE TRIGGER staff_members_updated_at BEFORE UPDATE ON staff_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Store-scoped roles need a store; platform roles must not have one.
CREATE OR REPLACE FUNCTION staff_members_scope_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE scoped BOOLEAN;
BEGIN
  SELECT store_scoped INTO scoped FROM staff_roles WHERE key = NEW.role_key;
  IF scoped AND NEW.store_id IS NULL THEN
    RAISE EXCEPTION 'role % requires a store', NEW.role_key
      USING ERRCODE = 'check_violation', CONSTRAINT = 'staff_store_scope';
  ELSIF NOT scoped AND NEW.store_id IS NOT NULL THEN
    RAISE EXCEPTION 'role % is platform-wide and cannot be tied to a store', NEW.role_key
      USING ERRCODE = 'check_violation', CONSTRAINT = 'staff_store_scope';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER staff_members_scope_check BEFORE INSERT OR UPDATE ON staff_members
  FOR EACH ROW EXECUTE FUNCTION staff_members_scope_check();

-- ---------------------------------------------------------------------
-- Drivers
-- ---------------------------------------------------------------------
CREATE TYPE driver_status AS ENUM (
  'available',  -- متاح
  'busy',       -- في توصيلة
  'offline'     -- غير متصل
);
CREATE TYPE vehicle_type AS ENUM ('motorcycle', 'car', 'van');

CREATE TABLE drivers (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  city          TEXT NOT NULL,
  vehicle       vehicle_type NOT NULL DEFAULT 'motorcycle',
  plate_number  TEXT,
  status        driver_status NOT NULL DEFAULT 'offline',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX drivers_available_idx ON drivers(city) WHERE status = 'available' AND is_active;
CREATE TRIGGER drivers_updated_at BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Orders ↔ drivers
-- ---------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN driver_id   UUID REFERENCES drivers(user_id) ON DELETE SET NULL,
  ADD COLUMN assigned_at TIMESTAMPTZ;
CREATE INDEX orders_driver_idx ON orders(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX orders_status_placed_idx ON orders(status, placed_at DESC);

-- "تم الشحن" means the parcel left with a courier: a driver must be assigned.
-- NOT VALID: historical orders are left as they are; new changes are checked.
ALTER TABLE orders
  ADD CONSTRAINT orders_shipped_needs_driver
  CHECK (status NOT IN ('shipped', 'delivered') OR driver_id IS NOT NULL) NOT VALID;

COMMIT;
