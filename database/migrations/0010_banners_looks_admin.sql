-- =====================================================================
-- Stylo (ستايلو) — Migration 0010
--   Home banners (البنرات) and looks («كمّل اللوك») managed from the
--   back office:
--   * banners: who/when edited, sane lengths, and an in-app link that
--     the app can always open (no external or script links).
--   * looks: who/when edited, slug format, lengths.
--   * Permissions: banners.manage (general manager, operations);
--     looks.manage (also store owners/managers — their store only;
--     featuring a look on the home screen stays a Stylo decision).
-- =====================================================================

BEGIN;

ALTER TABLE banners
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE banners
  ADD CONSTRAINT banners_lengths CHECK (
    char_length(title_ar) BETWEEN 2 AND 60
    AND (subtitle_ar IS NULL OR char_length(subtitle_ar) <= 90)
    AND (cta_ar IS NULL OR char_length(cta_ar) <= 24)
  ),
  -- Only routes inside the app: /products?…, /store/…, /look/…, /product/<id>, /categories.
  ADD CONSTRAINT banners_link_in_app CHECK (
    link IS NULL OR link ~ '^/(products\?[A-Za-z0-9_=&%.-]+|store/[a-z0-9-]+|look/[a-z0-9-]+|product/[0-9a-f-]{36}|categories)$'
  ),
  ADD CONSTRAINT banners_window CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);

CREATE TRIGGER banners_updated_at BEFORE UPDATE ON banners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE looks
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE looks
  ADD CONSTRAINT looks_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT looks_lengths CHECK (
    char_length(title_ar) BETWEEN 2 AND 60 AND (subtitle_ar IS NULL OR char_length(subtitle_ar) <= 90)
  );

CREATE TRIGGER looks_updated_at BEFORE UPDATE ON looks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

UPDATE staff_roles SET permissions = permissions || ARRAY['banners.manage']
 WHERE key IN ('super_admin', 'operations_manager') AND NOT ('banners.manage' = ANY(permissions));
UPDATE staff_roles SET permissions = permissions || ARRAY['looks.manage']
 WHERE key IN ('super_admin', 'operations_manager', 'store_owner', 'store_manager')
   AND NOT ('looks.manage' = ANY(permissions));

COMMIT;
