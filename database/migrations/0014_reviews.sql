-- 0014 — Real reviews («التقييمات»): only customers who received the product can rate it
-- (1–5 stars + optional text, one review per product, editable). Stylo staff can hide a review
-- (abuse, personal data); hidden reviews do not count in the product's rating.
BEGIN;

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT reviews_body_length CHECK (body IS NULL OR char_length(body) <= 500);

CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews (product_id, created_at DESC) WHERE NOT is_hidden;
CREATE INDEX IF NOT EXISTS reviews_recent_idx ON reviews (created_at DESC);

-- Moderation is a Stylo decision (stores never hide reviews of their own products).
UPDATE staff_roles SET permissions = permissions || ARRAY['reviews.manage']
 WHERE key IN ('super_admin', 'operations_manager') AND NOT ('reviews.manage' = ANY(permissions));

COMMIT;
