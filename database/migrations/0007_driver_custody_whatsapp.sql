-- =====================================================================
-- Stylo (ستايلو) — Migration 0007
--   * Cash on delivery + driver cash custody (عُهدة المناديب):
--     the cash a driver collects stays in their custody until a staff
--     member closes it (تقفيل العُهدة) and records what was handed over.
--   * Message log for WhatsApp (OTP codes + order status updates).
--   * finance.view: commission figures are visible to the general
--     manager only — everyone else gets them stripped by the API.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Payment method (every order so far was cash on delivery).
-- ---------------------------------------------------------------------
CREATE TYPE payment_method AS ENUM ('cod', 'online');

ALTER TABLE orders
  ADD COLUMN payment_method    payment_method NOT NULL DEFAULT 'cod',
  ADD COLUMN cash_collected_at TIMESTAMPTZ;

-- Past delivered COD orders: the cash was collected when they were delivered.
UPDATE orders o
   SET cash_collected_at = (SELECT max(h.changed_at) FROM order_status_history h
                             WHERE h.order_id = o.id AND h.to_status = 'delivered')
 WHERE o.status = 'delivered' AND o.payment_method = 'cod' AND o.driver_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Custody settlements: a staff member receives the cash from a driver.
-- ---------------------------------------------------------------------
CREATE TABLE driver_settlements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number           BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 7001) UNIQUE,
  driver_id        UUID NOT NULL REFERENCES drivers(user_id) ON DELETE RESTRICT,
  currency         CHAR(3) NOT NULL DEFAULT 'LYD',
  orders_count     INTEGER NOT NULL CHECK (orders_count > 0),
  amount_expected  BIGINT NOT NULL CHECK (amount_expected >= 0),  -- Σ order totals (dirhams)
  amount_received  BIGINT NOT NULL CHECK (amount_received >= 0),  -- counted by the staff member
  difference       BIGINT GENERATED ALWAYS AS (amount_received - amount_expected) STORED,
  note             TEXT,
  received_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  settled_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX driver_settlements_driver_idx ON driver_settlements (driver_id, settled_at DESC);

-- Each COD order's cash is handed over once (UNIQUE order_id).
CREATE TABLE driver_settlement_orders (
  settlement_id  UUID NOT NULL REFERENCES driver_settlements(id) ON DELETE CASCADE,
  order_id       UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  amount         BIGINT NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (settlement_id, order_id)
);

-- ---------------------------------------------------------------------
-- Outgoing messages (WhatsApp / SMS / console). Never stores OTP codes.
-- ---------------------------------------------------------------------
CREATE TABLE message_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel      TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'console')),
  purpose      TEXT NOT NULL CHECK (purpose IN ('otp', 'order_status')),
  to_phone     TEXT NOT NULL,
  template     TEXT,
  order_id     UUID REFERENCES orders(id) ON DELETE SET NULL,
  status       TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_id  TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX message_log_created_idx ON message_log (created_at DESC);

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
UPDATE staff_roles SET permissions = permissions || ARRAY['custody.read', 'custody.manage', 'finance.view']
 WHERE key = 'super_admin';
UPDATE staff_roles SET permissions = permissions || ARRAY['custody.read', 'custody.manage']
 WHERE key IN ('operations_manager', 'dispatcher');
-- Store payouts reveal sales and dues side by side (= the commission): general manager only.
-- Store owners keep payouts.read for their own store.
UPDATE staff_roles SET permissions = array_remove(permissions, 'payouts.read')
 WHERE key = 'operations_manager';

COMMIT;
