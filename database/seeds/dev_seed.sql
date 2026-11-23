-- Development seed data for Stylo. NOT for production.
BEGIN;

INSERT INTO users (id, email, full_name, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@stylo.local',    'مدير ستايلو', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'vendor1@stylo.local',  'نورة العتيبي', 'vendor'),
  ('00000000-0000-0000-0000-000000000003', 'vendor2@stylo.local',  'خالد الحربي', 'vendor'),
  ('00000000-0000-0000-0000-000000000004', 'customer@stylo.local', 'سارة أحمد', 'customer');

INSERT INTO stores (id, owner_id, slug, name_ar, name_en, status) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'noura-boutique', 'بوتيك نورة', 'Noura Boutique', 'active'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'urban-man',      'أوربان مان', 'Urban Man',      'active');

INSERT INTO categories (id, slug, name_ar, name_en, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000001', 'women',       'نساء',     'Women',       1),
  ('20000000-0000-0000-0000-000000000002', 'men',         'رجال',     'Men',         2),
  ('20000000-0000-0000-0000-000000000003', 'kids',        'أطفال',    'Kids',        3),
  ('20000000-0000-0000-0000-000000000004', 'accessories', 'إكسسوارات', 'Accessories', 4);

INSERT INTO products (id, store_id, category_id, slug, name_ar, base_price, status) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'linen-abaya', 'عباية كتان', 34900, 'active'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'oxford-shirt', 'قميص أكسفورد', 15900, 'active');

INSERT INTO product_variants (product_id, sku, size, color_name_ar, color_hex, stock_qty) VALUES
  ('30000000-0000-0000-0000-000000000001', 'NB-ABY-BLK-M', 'M', 'أسود', '#111111', 12),
  ('30000000-0000-0000-0000-000000000001', 'NB-ABY-BEI-L', 'L', 'بيج',  '#D8C3A5', 6),
  ('30000000-0000-0000-0000-000000000002', 'UM-OXF-WHT-L', 'L', 'أبيض', '#FFFFFF', 20);

COMMIT;
