-- =====================================================================
-- Stylo (ستايلو) — Migration 0006
--   * Sign-in with a Libyan mobile number + one-time code (OTP) for
--     customers, staff and store owners. Replaces the development
--     `x-user-id` identities.
--   * Store payouts (تسوية مستحقات المتاجر): delivered orders are settled
--     per store and period, once; each settlement keeps its own record.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- One-time codes. Only a hash of the code is stored.
-- ---------------------------------------------------------------------
CREATE TABLE otp_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        TEXT NOT NULL CHECK (phone ~ '^\+2189[1-5][0-9]{7}$'),
  code_hash    TEXT NOT NULL,
  attempts     SMALLINT NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_phone_idx ON otp_codes (phone, created_at DESC);

-- ---------------------------------------------------------------------
-- Sessions. The bearer token is random; only its SHA-256 is stored.
-- ---------------------------------------------------------------------
CREATE TYPE session_app AS ENUM ('customer', 'admin');

CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  app           session_app NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;

-- Phone numbers are how people sign in: normalise and require them for staff.
UPDATE users SET phone = NULL WHERE phone IS NOT NULL AND phone !~ '^\+2189[1-5][0-9]{7}$';

-- ---------------------------------------------------------------------
-- Payouts
-- ---------------------------------------------------------------------
CREATE TYPE payout_status AS ENUM (
  'pending',  -- معلّقة: calculated, waiting for the transfer
  'paid'      -- مدفوعة: transferred to the store
);

CREATE TABLE payouts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number         BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 5001) UNIQUE,
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  period_from    DATE NOT NULL,
  period_to      DATE NOT NULL CHECK (period_to >= period_from),
  currency       CHAR(3) NOT NULL DEFAULT 'LYD',
  orders_count   INTEGER NOT NULL CHECK (orders_count > 0),
  sales          BIGINT NOT NULL CHECK (sales >= 0),       -- Σ subtotal (dirhams)
  commission     BIGINT NOT NULL CHECK (commission >= 0),  -- Σ commission_amount
  payout_amount  BIGINT GENERATED ALWAYS AS (sales - commission) STORED,
  status         payout_status NOT NULL DEFAULT 'pending',
  note           TEXT,
  reference      TEXT,                                     -- bank transfer / receipt number
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_at        TIMESTAMPTZ,
  CONSTRAINT payouts_paid_fields CHECK ((status = 'paid') = (paid_at IS NOT NULL))
);
CREATE INDEX payouts_store_idx ON payouts (store_id, created_at DESC);

-- Each delivered order is settled at most once (UNIQUE order_id).
CREATE TABLE payout_orders (
  payout_id  UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  order_id   UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  PRIMARY KEY (payout_id, order_id)
);

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
UPDATE staff_roles SET permissions = permissions || ARRAY['payouts.read', 'payouts.manage']
 WHERE key = 'super_admin';
UPDATE staff_roles SET permissions = permissions || ARRAY['payouts.read']
 WHERE key IN ('operations_manager', 'store_owner');

COMMIT;
