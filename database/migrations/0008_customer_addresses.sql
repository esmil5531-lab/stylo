-- =====================================================================
-- Stylo (ستايلو) — Migration 0008
--   Customer addresses managed in the app («عناويني»): nearest landmark
--   (Libyan addresses rely on it), edit timestamp, and sane limits.
--   The delivery city must be one of the cities Stylo serves (checked
--   by the API against src/lib/cities.ts).
-- =====================================================================

BEGIN;

ALTER TABLE addresses
  ADD COLUMN landmark   TEXT,                                    -- أقرب معلم
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE addresses
  ADD CONSTRAINT addresses_lengths CHECK (
    char_length(recipient_name) BETWEEN 2 AND 80
    AND char_length(street) BETWEEN 2 AND 160
    AND char_length(city) BETWEEN 2 AND 40
    AND (label IS NULL OR char_length(label) <= 30)
    AND (district IS NULL OR char_length(district) <= 60)
    AND (building IS NULL OR char_length(building) <= 60)
    AND (landmark IS NULL OR char_length(landmark) <= 120)
  );

CREATE TRIGGER addresses_updated_at BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
