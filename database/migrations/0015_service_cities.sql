-- Delivery coverage («مناطق التوصيل»), owner decision Nov 2026: launch in Tripoli only.
-- A store is shown to customers only when its city is served, and an order is accepted only when
-- the customer's address is in a served city AND in the store's own city (no intercity delivery
-- until intercity fees exist). Opening a city later = one row here, no deploy:
--   INSERT INTO service_cities (city) VALUES ('بنغازي');
-- City names are the exact spellings of api/src/lib/cities.ts.
BEGIN;

CREATE TABLE service_cities (
  city       TEXT PRIMARY KEY CHECK (char_length(city) BETWEEN 2 AND 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO service_cities (city) VALUES ('طرابلس') ON CONFLICT DO NOTHING;

COMMIT;
