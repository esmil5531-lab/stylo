-- =====================================================================
-- Stylo (ستايلو) — Migration 0011
--   Photos uploaded from the back office (products, banners, looks,
--   categories). Each upload is stored as WebP in three sizes
--   (<key>-320.webp, -800.webp, -1600.webp) on the server disk or in
--   Supabase Storage; this table records who uploaded what.
--   The image columns (product_images.url, banners.image_url, …) keep
--   holding a URL: /uploads/<key>-1600.webp or the storage public URL.
-- =====================================================================

BEGIN;

CREATE TABLE media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose     TEXT NOT NULL CHECK (purpose IN ('product', 'banner', 'look', 'category')),
  store_id    UUID REFERENCES stores(id) ON DELETE SET NULL,
  storage     TEXT NOT NULL CHECK (storage IN ('local', 'supabase')),
  key         TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z]+/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}$'),
  url         TEXT NOT NULL,          -- the largest size; smaller sizes swap the -1600 suffix
  width       INTEGER NOT NULL CHECK (width > 0),
  height      INTEGER NOT NULL CHECK (height > 0),
  bytes       INTEGER NOT NULL CHECK (bytes > 0),   -- total of the three sizes
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX media_store_idx ON media (store_id, created_at DESC);

COMMIT;
