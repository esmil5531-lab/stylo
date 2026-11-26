-- Step 5 (Nov 2026): returns after delivery, customer refusal history + block, store bank details.
BEGIN;

-- ---------------------------------------------------------------------------------------------
-- Returns («المرتجعات»): recorded by Stylo staff when pieces of a DELIVERED order come back.
-- The customer gets the merchandise back (delivery fee not refunded); the store's next payout
-- deducts the amount and Stylo gives back its commission on it (same rate as the order).
-- ---------------------------------------------------------------------------------------------
CREATE TYPE return_reason AS ENUM ('wrong_size', 'defective', 'not_as_described', 'changed_mind', 'other');

CREATE TABLE order_returns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number            BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 9001) UNIQUE,
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  reason            return_reason NOT NULL,
  note              TEXT CONSTRAINT order_returns_note_length CHECK (char_length(note) <= 300),
  -- false when the pieces cannot be sold again (defective): stock is not increased.
  restocked         BOOLEAN NOT NULL,
  currency          CHAR(3) NOT NULL DEFAULT 'LYD',
  amount            BIGINT NOT NULL CHECK (amount > 0),          -- refunded merchandise (dirhams)
  commission_bps    INTEGER NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),  -- the order's rate
  commission_amount BIGINT GENERATED ALWAYS AS ((amount * commission_bps + 5000) / 10000) STORED,
  -- Set when a store payout deducts it; a cancelled (deleted) pending payout releases it.
  payout_id         UUID REFERENCES payouts(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_returns_order_idx ON order_returns (order_id);
CREATE INDEX order_returns_unsettled_idx ON order_returns (store_id, created_at) WHERE payout_id IS NULL;

CREATE TABLE order_return_items (
  return_id      UUID NOT NULL REFERENCES order_returns(id) ON DELETE CASCADE,
  order_item_id  UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  amount         BIGINT NOT NULL CHECK (amount > 0),
  PRIMARY KEY (return_id, order_item_id)
);

-- Payouts carry the returns they deduct. payout_amount is regenerated with them (old rows: 0).
ALTER TABLE payouts
  ADD COLUMN returns_count      INTEGER NOT NULL DEFAULT 0 CHECK (returns_count >= 0),
  ADD COLUMN returns_amount     BIGINT  NOT NULL DEFAULT 0 CHECK (returns_amount >= 0),
  ADD COLUMN returns_commission BIGINT  NOT NULL DEFAULT 0 CHECK (returns_commission >= 0);
ALTER TABLE payouts DROP COLUMN payout_amount;
ALTER TABLE payouts
  ADD COLUMN payout_amount BIGINT GENERATED ALWAYS AS (sales - commission - returns_amount + returns_commission) STORED;

-- ---------------------------------------------------------------------------------------------
-- Customer block («حظر الزبون»): staff decide from the refusal history (failed deliveries are
-- counted from orders.delivery_failure, no separate counter). Blocked = cannot check out.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN blocked_at     TIMESTAMPTZ,
  ADD COLUMN blocked_reason TEXT CONSTRAINT users_blocked_reason_length CHECK (char_length(blocked_reason) <= 200),
  ADD COLUMN blocked_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT users_blocked_reason_chk CHECK (blocked_at IS NULL OR blocked_reason IS NOT NULL);

-- ---------------------------------------------------------------------------------------------
-- Store bank details («الحساب البنكي»), for payouts. Any change clears the verification: the
-- general manager re-checks before transferring money to a new account.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE stores
  ADD COLUMN bank_name           TEXT CONSTRAINT stores_bank_name_length CHECK (char_length(bank_name) BETWEEN 2 AND 80),
  ADD COLUMN bank_account_name   TEXT CONSTRAINT stores_bank_account_name_length CHECK (char_length(bank_account_name) BETWEEN 2 AND 120),
  ADD COLUMN bank_iban           TEXT CONSTRAINT stores_bank_iban_format CHECK (bank_iban ~ '^LY[0-9]{23}$'),
  ADD COLUMN bank_account_number TEXT CONSTRAINT stores_bank_account_number_format CHECK (bank_account_number ~ '^[0-9]{6,20}$'),
  ADD COLUMN bank_updated_at     TIMESTAMPTZ,
  ADD COLUMN bank_updated_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN bank_verified_at    TIMESTAMPTZ,
  ADD COLUMN bank_verified_by    UUID REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------------------------
UPDATE staff_roles SET permissions = array_append(permissions, 'returns.manage')
 WHERE key IN ('super_admin', 'operations_manager', 'customer_support') AND NOT 'returns.manage' = ANY (permissions);
UPDATE staff_roles SET permissions = array_append(permissions, 'customers.block')
 WHERE key IN ('super_admin', 'operations_manager', 'customer_support') AND NOT 'customers.block' = ANY (permissions);
UPDATE staff_roles SET permissions = array_append(permissions, 'stores.bank')
 WHERE key = 'super_admin' AND NOT 'stores.bank' = ANY (permissions);

COMMIT;
