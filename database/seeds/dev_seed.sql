-- Development seed data for Stylo (Libyan market). NOT for production.
-- Re-runnable: wipes all app data first.
-- Prices are LYD in dirhams (1 د.ل = 1000): 199 د.ل => 199000.
-- compare_at_price > base_price marks a product as on offer ("عروض").
BEGIN;

TRUNCATE users, stores, categories, products, banners, looks, shared_carts, carts, staff_members, drivers,
         otp_codes, payouts RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------- users
INSERT INTO users (id, email, full_name, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@stylo.local',     'مدير ستايلو',   'admin'),
  ('00000000-0000-0000-0000-000000000002', 'vendor1@stylo.local',   'نورة الورفلي',  'vendor'),
  ('00000000-0000-0000-0000-000000000003', 'vendor2@stylo.local',   'خالد المصراتي', 'vendor'),
  ('00000000-0000-0000-0000-000000000004', 'customer@stylo.local',  'سارة أحمد',     'customer'),
  ('00000000-0000-0000-0000-000000000005', 'customer2@stylo.local', 'مريم علي',      'customer');

-- One owner account per store (each gets the «مالك المتجر» role below).
INSERT INTO users (id, email, phone, full_name, role) VALUES
  ('00000000-0000-0000-0000-000000000021', 'fiona@stylo.local', '+218910000021', 'فيروز الشريف',  'vendor'),
  ('00000000-0000-0000-0000-000000000022', 'stylo-col@stylo.local', '+218910000022', 'عمر بن سعيد', 'vendor'),
  ('00000000-0000-0000-0000-000000000023', 'luna@stylo.local',  '+218910000023', 'لينا القذافي',  'vendor'),
  ('00000000-0000-0000-0000-000000000024', 'chic@stylo.local',  '+218910000024', 'شيماء الجهاني', 'vendor'),
  ('00000000-0000-0000-0000-000000000025', 'vela@stylo.local',  '+218920000025', 'وفاء العبيدي',  'vendor');
-- Everyone signs in with a phone number + one-time code.
UPDATE users SET phone = '+218910000001' WHERE id = '00000000-0000-0000-0000-000000000001';
UPDATE users SET phone = '+218910000004' WHERE id = '00000000-0000-0000-0000-000000000004';
UPDATE users SET phone = '+218920000005' WHERE id = '00000000-0000-0000-0000-000000000005';
UPDATE users SET phone = '+218910000002' WHERE id = '00000000-0000-0000-0000-000000000002';
UPDATE users SET phone = '+218910000003' WHERE id = '00000000-0000-0000-0000-000000000003';

INSERT INTO addresses (user_id, label, recipient_name, phone, country_code, city, district, street, is_default) VALUES
  ('00000000-0000-0000-0000-000000000004', 'البيت', 'سارة أحمد', '+218910000004', 'LY', 'طرابلس', 'حي الأندلس', 'شارع جرابة', true),
  ('00000000-0000-0000-0000-000000000005', 'البيت', 'مريم علي',  '+218920000005', 'LY', 'بنغازي', 'الفويهات',  'شارع دبي',   true);

-- ---------------------------------------------------------------- stores
-- prep_hours: time for the store to prepare an order. delivery_fee: its standard delivery fee.
INSERT INTO stores (id, owner_id, slug, name_ar, name_en, logo_text, brand_color, city, prep_hours, delivery_fee, is_featured, status, rating_avg, rating_count) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'laura',  'أزياء لورا',      'Laura',  'LAURA', '#5B0E2D', 'طرابلس', 3,  10000, true,  'active', 4.8, 320),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000021', 'fiona',  'متجر فيونا',      'Fiona',  'FIONA', '#B08A5B', 'طرابلس', 4,  10000, false, 'active', 4.6, 118),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000022', 'stylo-collection', 'ستايلو كولكشن', 'Stylo Collection', 'STYLO', '#5B0E2D', 'طرابلس', 2, 8000, false, 'active', 4.7, 95),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000023', 'luna',   'لونا',            'Luna',   'LUNA',  '#C9A9A6', 'طرابلس', 4,  12000, true,  'active', 4.9, 210),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', 'nova',   'نوفا',            'Nova',   'NOVA',  '#8E8E8E', 'مصراتة', 6,  15000, true,  'active', 4.5, 87),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000024', 'chic',   'شيك',             'Chic',   'Chic',  '#D4B8A8', 'طرابلس', 3,  10000, true,  'active', 4.7, 156),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000025', 'vela',   'فيلا',            'Vela',   'VELA',  '#B79B87', 'بنغازي', 5,  15000, true,  'active', 4.6, 64);

-- Commission rates (basis points: 1000 = 10%) and store contact details.
UPDATE stores SET commission_bps = 1200, phone = '+218910000002', district = 'حي الأندلس' WHERE slug = 'laura';
UPDATE stores SET commission_bps = 1000, phone = '+218910000021', district = 'قرقارش'     WHERE slug = 'fiona';
UPDATE stores SET commission_bps = 800,  phone = '+218910000022', district = 'سوق الجمعة' WHERE slug = 'stylo-collection';
UPDATE stores SET commission_bps = 1500, phone = '+218910000023', district = 'ذات العماد' WHERE slug = 'luna';
UPDATE stores SET commission_bps = 1000, phone = '+218910000003', district = 'وسط المدينة' WHERE slug = 'nova';
UPDATE stores SET commission_bps = 1200, phone = '+218910000024', district = 'النوفليين'  WHERE slug = 'chic';
UPDATE stores SET commission_bps = 900,  phone = '+218920000025', district = 'الفويهات'   WHERE slug = 'vela';

-- ---------------------------------------------------------------- categories
INSERT INTO categories (id, slug, name_ar, name_en, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000001', 'women',       'نساء',       'Women',       1),
  ('20000000-0000-0000-0000-000000000002', 'men',         'رجال',       'Men',         2),
  ('20000000-0000-0000-0000-000000000003', 'kids',        'أطفال',      'Kids',        3),
  ('20000000-0000-0000-0000-000000000004', 'bags',        'حقائب',      'Bags',        4),
  ('20000000-0000-0000-0000-000000000005', 'shoes',       'أحذية',      'Shoes',       5),
  ('20000000-0000-0000-0000-000000000006', 'accessories', 'إكسسوارات',  'Accessories', 6),
  ('20000000-0000-0000-0000-000000000007', 'watches',     'ساعات',      'Watches',     7);

-- ---------------------------------------------------------------- products
-- created_at offsets make the "new" ordering deterministic.
INSERT INTO products (id, store_id, category_id, slug, name_ar, brand, base_price, compare_at_price, status, is_featured, sold_count, rating_avg, rating_count, created_at) VALUES
  -- أزياء لورا (the reference look: dress + bag + sunglasses + watch)
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'burgundy-wrap-dress', 'فستان ملفوف عنابي',     'Laura', 199000, 260000, 'active', true,  540, 4.8, 320, now() - interval '20 days'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'beige-tote-bag',      'حقيبة يد بيج',          'Laura', 249000, NULL,   'active', true,  410, 4.6, 118, now() - interval '18 days'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'black-cat-eye-sunglasses', 'نظارة شمسية سوداء', 'Laura',  89000, 110000, 'active', false, 300, 4.5,  72, now() - interval '12 days'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000007', 'gold-classic-watch',  'ساعة ذهبية كلاسيكية',   'Laura', 320000, 380000, 'active', true,  150, 4.9, 210, now() - interval '10 days'),
  ('30000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'black-abaya',         'عباية سوداء مطرزة',     'Laura', 285000, NULL,   'active', true,  480, 4.9, 260, now() - interval '30 days'),
  -- متجر فيونا
  ('30000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'cream-knit-cardigan', 'كارديغان صوف كريمي',    'Fiona', 165000, NULL,   'active', false, 170, 4.6,  58, now() - interval '5 hours'),
  ('30000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'cream-wide-pants',    'بنطلون واسع كريمي',     'Fiona', 145000, NULL,   'active', false, 120, 4.5,  31, now() - interval '2 days'),
  ('30000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', 'straw-summer-bag',    'حقيبة قش صيفية',        'Fiona', 120000, 150000, 'active', false, 95,  4.4,  22, now() - interval '6 days'),
  -- ستايلو كولكشن
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000005', 'white-sneakers',      'حذاء رياضي أبيض',       'Stylo', 199000, NULL,   'active', true,  620, 4.7,  95, now() - interval '15 days'),
  ('30000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'kids-denim-set',      'طقم جينز للأطفال',      'Stylo',  95000, 120000, 'active', false, 200, 4.5,  40, now() - interval '6 days'),
  ('30000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'white-cotton-tee',    'تيشيرت قطن أبيض',       'Stylo',  59000, NULL,   'active', false, 350, 4.6,  77, now() - interval '9 days'),
  -- لونا
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'satin-evening-dress', 'فستان سهرة ساتان',      'Luna',  420000, NULL,   'active', true,  95,  4.8,  44, now() - interval '2 days'),
  ('30000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000007', 'silver-slim-watch',   'ساعة فضية ناعمة',       'Luna',  280000, 340000, 'active', false, 60,  4.8,  19, now() - interval '7 days'),
  -- نوفا
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'linen-shirt',         'قميص كتان رجالي',       'Nova',  135000, 160000, 'active', false, 230, 4.4,  51, now() - interval '9 days'),
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'chino-pants',         'بنطلون تشينو',          'Nova',  149000, NULL,   'active', false, 180, 4.3,  38, now() - interval '8 days'),
  ('30000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000005', 'leather-loafers',     'حذاء لوفر جلد',         'Nova',  230000, 280000, 'active', false, 110, 4.6,  27, now() - interval '11 days'),
  -- شيك
  ('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000005', 'nude-heels',          'كعب عالي نود',          'Chic',  210000, 250000, 'active', true,  260, 4.6,  80, now() - interval '1 day'),
  ('30000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000004', 'satin-clutch',        'حقيبة سهرة ساتان',      'Chic',  130000, NULL,   'active', false, 140, 4.7,  36, now() - interval '3 days'),
  ('30000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000006', 'gold-earrings',       'أقراط ذهبية',           'Chic',   75000,  95000, 'active', false, 190, 4.8,  48, now() - interval '4 days'),
  -- فيلا
  ('30000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000004', 'mini-crossbody',      'حقيبة كروس صغيرة',      'Vela',  175000, NULL,   'active', false, 140, 4.6,  33, now() - interval '3 days'),
  ('30000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000006', 'pearl-necklace',      'قلادة لؤلؤ',            'Vela',   99000, NULL,   'active', false, 90,  4.7,  29, now() - interval '4 hours');

INSERT INTO product_variants (product_id, sku, size, color_name_ar, color_hex, stock_qty) VALUES
  ('30000000-0000-0000-0000-000000000001', 'LAU-WRP-BRG-S',  'S',   'عنابي', '#5B0E2D', 8),
  ('30000000-0000-0000-0000-000000000001', 'LAU-WRP-BRG-M',  'M',   'عنابي', '#5B0E2D', 12),
  ('30000000-0000-0000-0000-000000000001', 'LAU-WRP-BRG-L',  'L',   'عنابي', '#5B0E2D', 5),
  ('30000000-0000-0000-0000-000000000002', 'LAU-TOT-BEI',    NULL,  'بيج',   '#E8DCCB', 15),
  ('30000000-0000-0000-0000-000000000004', 'LAU-SUN-BLK',    NULL,  'أسود',  '#1A1A1A', 25),
  ('30000000-0000-0000-0000-000000000005', 'LAU-WAT-GLD',    NULL,  'ذهبي',  '#C9A24B', 7),
  ('30000000-0000-0000-0000-000000000012', 'LAU-ABY-BLK-M',  'M',   'أسود',  '#111111', 10),
  ('30000000-0000-0000-0000-000000000012', 'LAU-ABY-BLK-L',  'L',   'أسود',  '#111111', 6),
  ('30000000-0000-0000-0000-000000000014', 'FIO-CAR-CRM-M',  'M',   'كريمي', '#EDE3D1', 9),
  ('30000000-0000-0000-0000-000000000015', 'FIO-PNT-CRM-M',  'M',   'كريمي', '#E9DDC7', 7),
  ('30000000-0000-0000-0000-000000000016', 'FIO-STR-NAT',    NULL,  'طبيعي', '#D8BE8C', 10),
  ('30000000-0000-0000-0000-000000000003', 'STY-SNK-WHT-38', '38',  'أبيض',  '#F2F2F2', 6),
  ('30000000-0000-0000-0000-000000000003', 'STY-SNK-WHT-39', '39',  'أبيض',  '#F2F2F2', 9),
  ('30000000-0000-0000-0000-000000000003', 'STY-SNK-WHT-40', '40',  'أبيض',  '#F2F2F2', 4),
  ('30000000-0000-0000-0000-000000000013', 'STY-KDS-DNM-6',  '6Y',  'جينز',  '#5B7DA8', 12),
  ('30000000-0000-0000-0000-000000000017', 'STY-TEE-WHT-L',  'L',   'أبيض',  '#F5F5F5', 30),
  ('30000000-0000-0000-0000-000000000006', 'LUN-SAT-WIN-S',  'S',   'نبيتي', '#3F0820', 3),
  ('30000000-0000-0000-0000-000000000006', 'LUN-SAT-WIN-M',  'M',   'نبيتي', '#3F0820', 4),
  ('30000000-0000-0000-0000-000000000020', 'LUN-WAT-SLV',    NULL,  'فضي',   '#B8BCC2', 5),
  ('30000000-0000-0000-0000-000000000007', 'NOV-LIN-WHT-L',  'L',   'أبيض',  '#F5F1EA', 10),
  ('30000000-0000-0000-0000-000000000007', 'NOV-LIN-BLU-L',  'L',   'أزرق',  '#7C9CC2', 10),
  ('30000000-0000-0000-0000-000000000008', 'NOV-CHI-BEI-32', '32',  'بيج',   '#CDB89A', 9),
  ('30000000-0000-0000-0000-000000000021', 'NOV-LOF-BRN-42', '42',  'بني',   '#6B4226', 6),
  ('30000000-0000-0000-0000-000000000009', 'CHC-HEL-NUD-38', '38',  'نود',   '#D9B8A0', 5),
  ('30000000-0000-0000-0000-000000000009', 'CHC-HEL-NUD-39', '39',  'نود',   '#D9B8A0', 5),
  ('30000000-0000-0000-0000-000000000018', 'CHC-CLT-CHA',    NULL,  'شمبانيا', '#E6CFA7', 8),
  ('30000000-0000-0000-0000-000000000019', 'CHC-EAR-GLD',    NULL,  'ذهبي',  '#C9A24B', 20),
  ('30000000-0000-0000-0000-000000000010', 'VEL-CRS-BLK',    NULL,  'أسود',  '#222222', 11),
  ('30000000-0000-0000-0000-000000000011', 'VEL-PRL-WHT',    NULL,  'لؤلؤي', '#F4EFE6', 14);

UPDATE product_variants v SET position = x.rn
  FROM (SELECT id, row_number() OVER (PARTITION BY product_id ORDER BY sku) AS rn FROM product_variants) x
 WHERE x.id = v.id;

-- ---------------------------------------------------------------- banners
INSERT INTO banners (title_ar, subtitle_ar, cta_ar, link, sort_order) VALUES
  ('إطلالتك تبدأ من هنا', 'أزياء مختارة لك بعناية',        'تسوقي الآن',   '/products?feed=for_you', 1),
  ('عروض حصرية',          'تخفيضات تصل إلى 25% بالدينار الليبي', 'تسوقي العروض', '/products?feed=offers', 2),
  ('الأكثر طلباً',        'ما يحبه الجميع هذا الأسبوع',     'تسوقي الترند', '/products?feed=trending', 3);

-- ---------------------------------------------------------------- looks (كمّل اللوك) — one store each
INSERT INTO looks (id, store_id, slug, title_ar, subtitle_ar, is_featured, sort_order) VALUES
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'evening-burgundy', 'إطلالة مسائية بالعنابي', 'فستان، حقيبة، نظارة وساعة', true,  1),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'casual-cream',     'كاجوال كريمي ناعم',     'راحة وأناقة لكل يوم',        false, 2),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000006', 'chic-evening',     'سهرة شيك',               'كعب، حقيبة سهرة وأقراط',     false, 3),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005', 'smart-casual-men', 'سمارت كاجوال رجالي',     'قميص كتان، تشينو ولوفر',     false, 4);

INSERT INTO look_items (look_id, product_id, position) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 2),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 3),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', 4),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000014', 1),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000015', 2),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000016', 3),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000009', 1),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000018', 2),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000019', 3),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000007', 1),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000008', 2),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000021', 3);

-- ---------------------------------------------------------------- back-office (لوحة الإدارة)
INSERT INTO users (id, email, phone, full_name, role) VALUES
  ('00000000-0000-0000-0000-000000000006', 'ops@stylo.local',     '+218910000006', 'أحمد الزوي',     'staff'),
  ('00000000-0000-0000-0000-000000000007', 'support@stylo.local', '+218910000007', 'هدى بن علي',     'staff'),
  ('00000000-0000-0000-0000-000000000008', 'laura.mgr@stylo.local','+218910000008', 'ريم الترهوني',   'staff'),
  ('00000000-0000-0000-0000-000000000011', NULL,                  '+218910000011', 'محمد الككلي',    'driver'),
  ('00000000-0000-0000-0000-000000000012', NULL,                  '+218920000012', 'علي المغربي',    'driver'),
  ('00000000-0000-0000-0000-000000000013', NULL,                  '+218910000013', 'سالم القماطي',   'driver');

INSERT INTO staff_members (user_id, role_key, store_id, job_title) VALUES
  ('00000000-0000-0000-0000-000000000001', 'super_admin',        NULL, 'المدير العام'),
  ('00000000-0000-0000-0000-000000000006', 'operations_manager', NULL, 'مدير العمليات'),
  ('00000000-0000-0000-0000-000000000007', 'customer_support',   NULL, 'خدمة العملاء'),
  ('00000000-0000-0000-0000-000000000008', 'store_manager',      '10000000-0000-0000-0000-000000000001', 'مديرة متجر أزياء لورا');

INSERT INTO staff_members (user_id, role_key, store_id, job_title)
SELECT owner_id, 'store_owner', id, 'مالك المتجر' FROM stores;

INSERT INTO drivers (user_id, city, vehicle, plate_number, status) VALUES
  ('00000000-0000-0000-0000-000000000011', 'طرابلس', 'motorcycle', '5-123456', 'busy'),
  ('00000000-0000-0000-0000-000000000012', 'بنغازي', 'car',        '10-654321', 'available'),
  ('00000000-0000-0000-0000-000000000013', 'طرابلس', 'motorcycle', '5-777888', 'available');

-- ---------------------------------------------------------------- sample orders (one per status)
INSERT INTO orders (id, checkout_id, customer_id, store_id, subtotal, shipping_fee, shipping_address, delivery_mode, placed_at) VALUES
  ('50000000-0000-0000-0000-000000000001', gen_random_uuid(), '00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 199000, 15000,
    '{"recipient_name":"سارة أحمد","phone":"+218910000004","city":"طرابلس","district":"حي الأندلس","street":"شارع جرابة"}', 'fastest',  now() - interval '20 minutes'),
  ('50000000-0000-0000-0000-000000000002', gen_random_uuid(), '00000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000006', 210000, 10000,
    '{"recipient_name":"مريم علي","phone":"+218920000005","city":"بنغازي","district":"الفويهات","street":"شارع دبي"}', 'standard', now() - interval '2 hours'),
  ('50000000-0000-0000-0000-000000000003', gen_random_uuid(), '00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 165000, 10000,
    '{"recipient_name":"سارة أحمد","phone":"+218910000004","city":"طرابلس","district":"حي الأندلس","street":"شارع جرابة"}', 'standard', now() - interval '5 hours'),
  ('50000000-0000-0000-0000-000000000004', gen_random_uuid(), '00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005', 135000, 20000,
    '{"recipient_name":"سارة أحمد","phone":"+218910000004","city":"طرابلس","district":"حي الأندلس","street":"شارع جرابة"}', 'fastest',  now() - interval '1 day'),
  ('50000000-0000-0000-0000-000000000005', gen_random_uuid(), '00000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000007', 175000, 15000,
    '{"recipient_name":"مريم علي","phone":"+218920000005","city":"بنغازي","district":"الفويهات","street":"شارع دبي"}', 'standard', now() - interval '3 days'),
  ('50000000-0000-0000-0000-000000000006', gen_random_uuid(), '00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 420000, 12000,
    '{"recipient_name":"سارة أحمد","phone":"+218910000004","city":"طرابلس","district":"حي الأندلس","street":"شارع جرابة"}', 'standard', now() - interval '2 days');

INSERT INTO order_items (order_id, variant_id, product_name_ar, sku, size, color_name_ar, unit_price, quantity)
SELECT o.id, v.id, p.name_ar, v.sku, v.size, v.color_name_ar, COALESCE(v.price, p.base_price), 1
  FROM (VALUES ('50000000-0000-0000-0000-000000000001'::uuid, 'LAU-WRP-BRG-M'),
               ('50000000-0000-0000-0000-000000000002'::uuid, 'CHC-HEL-NUD-38'),
               ('50000000-0000-0000-0000-000000000003'::uuid, 'FIO-CAR-CRM-M'),
               ('50000000-0000-0000-0000-000000000004'::uuid, 'NOV-LIN-WHT-L'),
               ('50000000-0000-0000-0000-000000000005'::uuid, 'VEL-CRS-BLK'),
               ('50000000-0000-0000-0000-000000000006'::uuid, 'LUN-SAT-WIN-M')) AS x(order_id, sku)
  JOIN orders o ON o.id = x.order_id
  JOIN product_variants v ON v.sku = x.sku
  JOIN products p ON p.id = v.product_id;

UPDATE orders o SET commission_bps = s.commission_bps FROM stores s WHERE s.id = o.store_id;

-- Walk orders through the allowed transitions (the trigger records history).
UPDATE orders SET status = 'confirmed'  WHERE id IN ('50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000005');
UPDATE orders SET status = 'processing' WHERE id IN ('50000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000005');
UPDATE orders SET driver_id = '00000000-0000-0000-0000-000000000011', assigned_at = now() - interval '20 hours' WHERE id = '50000000-0000-0000-0000-000000000004';
UPDATE orders SET driver_id = '00000000-0000-0000-0000-000000000012', assigned_at = now() - interval '3 days'   WHERE id = '50000000-0000-0000-0000-000000000005';
UPDATE orders SET status = 'shipped'    WHERE id IN ('50000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000005');
UPDATE orders SET status = 'delivered', payment_status = 'paid' WHERE id = '50000000-0000-0000-0000-000000000005';
UPDATE orders SET status = 'cancelled', cancel_reason = 'طلب العميلة الإلغاء' WHERE id = '50000000-0000-0000-0000-000000000006';


-- ---------------------------------------------------------------- order history for reports
-- ~60 past orders over the last four weeks (deterministic pseudo-random), mostly delivered.
DO $$
DECLARE
  i INT;
  r RECORD;
  oid UUID;
  qty INT;
  cust UUID;
  drv UUID;
BEGIN
  PERFORM setseed(0.42);
  FOR i IN 1..60 LOOP
    SELECT pv.id AS variant_id, pv.sku, pv.size, pv.color_name_ar, p.id AS product_id, p.name_ar, p.store_id,
           COALESCE(pv.price, p.base_price) AS price, s.delivery_fee, s.commission_bps
      INTO r
      FROM product_variants pv JOIN products p ON p.id = pv.product_id JOIN stores s ON s.id = p.store_id
     ORDER BY random() LIMIT 1;
    qty  := 1 + floor(random() * 2)::int;
    cust := CASE WHEN random() < 0.6 THEN '00000000-0000-0000-0000-000000000004'::uuid
                 ELSE '00000000-0000-0000-0000-000000000005'::uuid END;
    drv  := CASE WHEN cust = '00000000-0000-0000-0000-000000000005'::uuid
                 THEN '00000000-0000-0000-0000-000000000012'::uuid
                 ELSE '00000000-0000-0000-0000-000000000013'::uuid END;

    INSERT INTO orders (checkout_id, customer_id, store_id, subtotal, shipping_fee, commission_bps,
                        shipping_address, delivery_mode, placed_at)
    VALUES (gen_random_uuid(), cust, r.store_id, r.price * qty, r.delivery_fee, r.commission_bps,
            CASE WHEN cust = '00000000-0000-0000-0000-000000000005'::uuid
                 THEN '{"recipient_name":"مريم علي","phone":"+218920000005","city":"بنغازي","district":"الفويهات","street":"شارع دبي"}'::jsonb
                 ELSE '{"recipient_name":"سارة أحمد","phone":"+218910000004","city":"طرابلس","district":"حي الأندلس","street":"شارع جرابة"}'::jsonb END,
            CASE WHEN random() < 0.4 THEN 'fastest'::delivery_mode ELSE 'standard'::delivery_mode END,
            now() - interval '1 day' - (i * interval '10 hours') - (random() * interval '4 hours'))
    RETURNING id INTO oid;

    INSERT INTO order_items (order_id, variant_id, product_name_ar, sku, size, color_name_ar, unit_price, quantity)
    VALUES (oid, r.variant_id, r.name_ar, r.sku, r.size, r.color_name_ar, r.price, qty);

    IF random() < 0.12 THEN
      UPDATE orders SET status = 'cancelled', cancel_reason = 'طلب العميلة الإلغاء' WHERE id = oid;
    ELSE
      UPDATE orders SET status = 'confirmed' WHERE id = oid;
      UPDATE orders SET status = 'processing' WHERE id = oid;
      UPDATE orders SET driver_id = drv, assigned_at = now() WHERE id = oid;
      UPDATE orders SET status = 'shipped' WHERE id = oid;
      UPDATE orders SET status = 'delivered', payment_status = 'paid' WHERE id = oid;
      UPDATE products SET sold_count = sold_count + qty WHERE id = r.product_id;
    END IF;
  END LOOP;
END;
$$;

-- Status history happened when the orders did (not at seeding time), so reports and payout
-- periods by delivery day look like real life.
UPDATE order_status_history h
   SET changed_at = o.placed_at + CASE h.to_status
         WHEN 'pending'    THEN interval '0'
         WHEN 'confirmed'  THEN interval '25 minutes'
         WHEN 'processing' THEN interval '2 hours'
         WHEN 'shipped'    THEN interval '5 hours'
         WHEN 'delivered'  THEN interval '9 hours'
         WHEN 'cancelled'  THEN interval '1 hour'
       END
  FROM orders o
 WHERE o.id = h.order_id;

COMMIT;
