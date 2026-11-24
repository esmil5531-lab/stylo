-- =====================================================================
-- Stylo (ستايلو) — Migration 0009
--   Categories managed from the back office (الأقسام):
--   * status (shown / hidden), icon, tile colour, optional image,
--     timestamps; two levels only: main category → sub-category.
--   * The default tree: نساء، رجال، أطفال، حقائب، أحذية، إكسسوارات،
--     ساعات، عناية وجمال — each with its sub-categories.
--     ON CONFLICT DO NOTHING: existing categories (and their ids,
--     which products reference) are never changed.
--   * Permission categories.manage (general manager, operations).
-- =====================================================================

BEGIN;

ALTER TABLE categories
  ADD COLUMN icon        TEXT,          -- MaterialCommunityIcons name, e.g. 'shoe-heel'
  ADD COLUMN color       CHAR(7),       -- tile tint, e.g. '#5B0E2D'
  ADD COLUMN image_url   TEXT,          -- optional photo instead of the icon tile
  ADD COLUMN is_active   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE categories
  ADD CONSTRAINT categories_icon_format  CHECK (icon IS NULL OR icon ~ '^[a-z0-9-]{2,40}$'),
  ADD CONSTRAINT categories_color_format CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT categories_slug_format  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT categories_name_length  CHECK (char_length(name_ar) BETWEEN 2 AND 40),
  ADD CONSTRAINT categories_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX IF NOT EXISTS categories_parent_idx ON categories (parent_id, sort_order);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category_id);

CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Two levels only: a sub-category's parent must be a main category, and a category that has
-- sub-categories cannot itself become one.
CREATE OR REPLACE FUNCTION categories_two_levels() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM categories WHERE id = NEW.parent_id AND parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'a sub-category cannot have sub-categories'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'categories_two_levels';
    END IF;
    IF EXISTS (SELECT 1 FROM categories WHERE parent_id = NEW.id) THEN
      RAISE EXCEPTION 'a category with sub-categories cannot become a sub-category'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'categories_two_levels';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER categories_two_levels BEFORE INSERT OR UPDATE OF parent_id ON categories
  FOR EACH ROW EXECUTE FUNCTION categories_two_levels();

-- ---------------------------------------------------------------------
-- Default tree. Main categories keep the ids the development seed uses.
-- ---------------------------------------------------------------------
INSERT INTO categories (id, slug, name_ar, name_en, sort_order, icon, color) VALUES
  ('20000000-0000-0000-0000-000000000001', 'women',       'نساء',        'Women',          1, 'hanger',       '#5B0E2D'),
  ('20000000-0000-0000-0000-000000000002', 'men',         'رجال',        'Men',            2, 'tshirt-crew',  '#B08A5B'),
  ('20000000-0000-0000-0000-000000000003', 'kids',        'أطفال',       'Kids',           3, 'human-child',  '#3F0820'),
  ('20000000-0000-0000-0000-000000000004', 'bags',        'حقائب',       'Bags',           4, 'purse',        '#C9A9A6'),
  ('20000000-0000-0000-0000-000000000005', 'shoes',       'أحذية',       'Shoes',          5, 'shoe-heel',    '#8E8E8E'),
  ('20000000-0000-0000-0000-000000000006', 'accessories', 'إكسسوارات',   'Accessories',    6, 'sunglasses',   '#D4B8A8'),
  ('20000000-0000-0000-0000-000000000007', 'watches',     'ساعات',       'Watches',        7, 'watch',        '#B79B87'),
  ('20000000-0000-0000-0000-000000000008', 'care',        'عناية وجمال', 'Beauty & care',  8, 'lipstick',     '#A85C76')
ON CONFLICT DO NOTHING;

-- Existing main categories (created by earlier seeds) get their icon and colour.
UPDATE categories c SET icon = d.icon, color = d.color
  FROM (VALUES ('women', 'hanger', '#5B0E2D'), ('men', 'tshirt-crew', '#B08A5B'), ('kids', 'human-child', '#3F0820'),
               ('bags', 'purse', '#C9A9A6'), ('shoes', 'shoe-heel', '#8E8E8E'), ('accessories', 'sunglasses', '#D4B8A8'),
               ('watches', 'watch', '#B79B87'), ('care', 'lipstick', '#A85C76')) AS d(slug, icon, color)
 WHERE c.slug = d.slug AND c.parent_id IS NULL AND c.icon IS NULL;

INSERT INTO categories (parent_id, slug, name_ar, name_en, sort_order, icon)
SELECT p.id, d.slug, d.name_ar, d.name_en, d.sort_order, d.icon
  FROM (VALUES
    ('women', 'women-dresses',     'فساتين',              'Dresses',             1, 'hanger'),
    ('women', 'women-abayas',      'عبايات وجلابيات',     'Abayas',              2, 'hanger'),
    ('women', 'women-tops',        'بلوزات وقمصان',       'Tops & shirts',       3, 'tshirt-v'),
    ('women', 'women-bottoms',     'بناطيل وتنانير',      'Pants & skirts',      4, 'hanger'),
    ('women', 'women-outerwear',   'جاكيتات وتريكو',      'Jackets & knitwear',  5, 'hanger'),
    ('women', 'women-sport',       'ملابس رياضية',        'Sportswear',          6, 'run'),
    ('men',   'men-shirts',        'قمصان وتيشيرتات',     'Shirts & T-shirts',   1, 'tshirt-crew'),
    ('men',   'men-pants',         'بناطيل',              'Pants',               2, 'hanger'),
    ('men',   'men-formal',        'بدلات وملابس رسمية',  'Suits & formal',      3, 'account-tie'),
    ('men',   'men-traditional',   'ملابس تقليدية',       'Traditional wear',    4, 'hanger'),
    ('men',   'men-sport',         'ملابس رياضية',        'Sportswear',          5, 'run'),
    ('kids',  'kids-girls',        'بنات',                'Girls',               1, 'human-female-girl'),
    ('kids',  'kids-boys',         'أولاد',               'Boys',                2, 'human-male-boy'),
    ('kids',  'kids-baby',         'رضّع',                'Baby',                3, 'baby-face-outline'),
    ('bags',  'bags-handbags',     'حقائب يد',            'Handbags',            1, 'purse'),
    ('bags',  'bags-crossbody',    'حقائب كروس',          'Crossbody bags',      2, 'purse-outline'),
    ('bags',  'bags-evening',      'حقائب سهرة',          'Evening bags',        3, 'purse'),
    ('bags',  'bags-backpacks',    'حقائب ظهر',           'Backpacks',           4, 'bag-personal'),
    ('bags',  'bags-wallets',      'محافظ',               'Wallets',             5, 'wallet'),
    ('shoes', 'shoes-heels',       'كعب عالي',            'Heels',               1, 'shoe-heel'),
    ('shoes', 'shoes-sneakers',    'أحذية رياضية',        'Sneakers',            2, 'shoe-sneaker'),
    ('shoes', 'shoes-flats',       'أحذية مسطحة وصنادل',  'Flats & sandals',     3, 'shoe-ballet'),
    ('shoes', 'shoes-men',         'أحذية رجالية',        'Men''s shoes',        4, 'shoe-formal'),
    ('accessories', 'acc-jewelry',    'مجوهرات وإكسسوار', 'Jewellery',          1, 'necklace'),
    ('accessories', 'acc-sunglasses', 'نظارات',           'Sunglasses',         2, 'sunglasses'),
    ('accessories', 'acc-belts',      'أحزمة',            'Belts',              3, 'hanger'),
    ('accessories', 'acc-scarves',    'أوشحة وشالات',     'Scarves & shawls',   4, 'hanger'),
    ('accessories', 'acc-hats',       'قبعات',            'Hats',               5, 'hat-fedora'),
    ('watches', 'watches-women',   'ساعات نسائية',        'Women''s watches',    1, 'watch-variant'),
    ('watches', 'watches-men',     'ساعات رجالية',        'Men''s watches',      2, 'watch'),
    ('care',  'care-perfume',      'عطور',                'Perfume',             1, 'spray'),
    ('care',  'care-makeup',       'مكياج',               'Makeup',              2, 'lipstick'),
    ('care',  'care-skin',         'عناية بالبشرة',       'Skin care',           3, 'lotion-outline'),
    ('care',  'care-hair',         'عناية بالشعر',        'Hair care',           4, 'hair-dryer')
  ) AS d(parent_slug, slug, name_ar, name_en, sort_order, icon)
  JOIN categories p ON p.slug = d.parent_slug AND p.parent_id IS NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------
UPDATE staff_roles SET permissions = permissions || ARRAY['categories.manage']
 WHERE key IN ('super_admin', 'operations_manager') AND NOT ('categories.manage' = ANY(permissions));

COMMIT;
