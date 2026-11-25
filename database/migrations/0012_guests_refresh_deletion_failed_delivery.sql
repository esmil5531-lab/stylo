-- 0012 — Phase B: guest shopping, long-lived sign-in, account deletion, failed delivery.
--
-- 1. Guests: browsing and the cart work without signing in. A guest is an anonymous `users`
--    row (role 'guest', no phone) with its own session; at sign-in its cart and favourites move
--    to the real account and the guest row is deleted. Guests can never check out.
-- 2. Sessions get a refresh token: a short-lived access token (bearer) + a long-lived, rotating
--    refresh token kept in the phone's secure storage, so the code is asked once per device.
-- 3. Account deletion: personal data is erased, the row is kept (orders reference it).
-- 4. Failed delivery («تعذّر التسليم»): shipped → cancelled is allowed, only with a reason.
-- 5. users.phone must be a normalised Libyan mobile number (+2189XXXXXXXX): one account per number.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'guest';

BEGIN;

-- ----------------------------------------------------------------------------- users
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Guests and deleted accounts have neither phone nor e-mail. (role::text: the new enum value
-- cannot be used as a literal in the transaction that adds it.)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_contact_chk;
ALTER TABLE users ADD CONSTRAINT users_contact_chk
  CHECK (email IS NOT NULL OR phone IS NOT NULL OR role::text = 'guest' OR deleted_at IS NOT NULL);

-- Every way of creating an account normalises the number; the database now guarantees it, so
-- +21891…, 091… and 91… can never become two accounts. NOT VALID: enforced for new and changed
-- rows without failing on anything older.
ALTER TABLE users ADD CONSTRAINT users_phone_format
  CHECK (phone IS NULL OR phone ~ '^\+2189[1-5][0-9]{7}$') NOT VALID;

-- Finds stale guests for the clean-up (guests have neither phone nor e-mail; enum casts are not
-- allowed in an index predicate).
CREATE INDEX IF NOT EXISTS users_no_contact_idx ON users (updated_at) WHERE phone IS NULL AND email IS NULL;

-- ----------------------------------------------------------------------------- sessions
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS refresh_hash TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS refresh_expires_at TIMESTAMPTZ,
  -- The previous refresh token, kept to tell a lost response (retried within seconds) from a
  -- stolen token replayed later (→ the whole session is revoked).
  ADD COLUMN IF NOT EXISTS previous_refresh_hash TEXT,
  ADD COLUMN IF NOT EXISTS refreshed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sessions_previous_refresh_idx ON sessions (previous_refresh_hash)
  WHERE previous_refresh_hash IS NOT NULL;

-- ----------------------------------------------------------------------------- failed delivery
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_failure TEXT
  CHECK (delivery_failure IN ('no_answer', 'refused', 'wrong_address', 'postponed'));
ALTER TABLE orders ADD CONSTRAINT orders_failure_is_cancelled
  CHECK (delivery_failure IS NULL OR status = 'cancelled');

-- Allowed transitions: shipped may now also become cancelled (failed delivery).
CREATE OR REPLACE FUNCTION order_status_can_transition(f order_status, t order_status)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE f
    WHEN 'pending'    THEN t IN ('confirmed', 'cancelled')
    WHEN 'confirmed'  THEN t IN ('processing', 'cancelled')
    WHEN 'processing' THEN t IN ('shipped', 'cancelled')
    WHEN 'shipped'    THEN t IN ('delivered', 'cancelled')
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
    -- A parcel already on the road is only cancelled as a failed delivery, with its reason.
    IF OLD.status = 'shipped' AND NEW.status = 'cancelled' AND NEW.delivery_failure IS NULL THEN
      RAISE EXCEPTION 'a shipped order is cancelled only as a failed delivery (delivery_failure)'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_failure_reason_required';
    END IF;
    INSERT INTO order_status_history(order_id, from_status, to_status, changed_by, note)
    VALUES (NEW.id, OLD.status, NEW.status,
            NULLIF(current_setting('stylo.actor_id', true), '')::uuid,
            NULLIF(current_setting('stylo.status_note', true), ''));
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
