import type { Queryable } from './db.js';

/**
 * Search engines (Google) and link previews (WhatsApp, Facebook) for the customer site.
 *
 * The customer site is an Expo static export: each route's HTML has an empty <title> and the
 * content is rendered by JavaScript. Google can run JavaScript, but titles, descriptions, link
 * previews and product rich results must be in the HTML itself — so the API injects them per URL:
 * <title>, description, canonical, OpenGraph/Twitter, robots, JSON-LD (Product / Store / WebSite),
 * and a <noscript> summary of the page content.
 *
 * Private pages (cart, account, orders, notifications, driver, login, shared carts) are `noindex`.
 * Indexing is on only in production (or SEO_INDEXING=true) so staging never shows up in Google.
 */

export interface SeoConfig {
  /** Public origin, e.g. https://stylo.ly — used for canonical URLs and the sitemap. */
  siteUrl?: string;
  indexing: boolean;
  googleSiteVerification?: string;
}

export interface PageMeta {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  type?: 'website' | 'product' | 'profile';
  noindex?: boolean;
  jsonLd?: Record<string, unknown>[];
  /** Plain summary for crawlers without JavaScript. */
  summary?: { heading: string; lines: string[]; links?: { href: string; label: string }[] };
  /** 404 for products/stores/looks that don't exist (or aren't public). */
  status?: number;
}

const SITE_NAME = 'ستايلو';
const TAGLINE = 'كل ستايل في مكان واحد';
const DEFAULT_DESCRIPTION =
  'ستايلو — كل ستايل في مكان واحد. تسوّقي أزياء النساء والأحذية والحقائب من أفضل المتاجر الليبية في مكان واحد، بالدينار الليبي، مع توصيل سريع في طرابلس وبنغازي والدفع عند الاستلام.';

/** Pages that belong to one person: never indexed. */
const PRIVATE = /^(cart|wishlist|account|login|profile|notifications|delete-account|onboarding|addresses(\/.*)?|orders(\/.*)?|driver|shared-cart\/.+)$/;

export const DISALLOWED_PATHS = ['/admin/', '/v1/', '/cart', '/wishlist', '/account', '/login', '/orders', '/driver', '/addresses', '/profile', '/notifications', '/delete-account', '/shared-cart/'];

function lyd(dirhams: number): string {
  const v = (dirhams / 1000).toFixed(3).replace(/\.?0+$/, '');
  return `${v} د.ل`;
}

function clip(text: string, max = 160): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export async function pageMeta(db: Queryable, path: string, query: URLSearchParams): Promise<PageMeta> {
  const base = { title: `${SITE_NAME} — ${TAGLINE}`, description: DEFAULT_DESCRIPTION, path: `/${path}` };

  if (PRIVATE.test(path)) return { ...base, path: `/${path}`, noindex: true };

  if (path === '') {
    return {
      ...base,
      path: '/',
      jsonLd: [
        { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, alternateName: 'Stylo', url: '/' },
        { '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, alternateName: 'Stylo', url: '/' },
      ],
      summary: { heading: `${SITE_NAME} — ${TAGLINE}`, lines: [DEFAULT_DESCRIPTION] },
    };
  }

  // Legal pages: public, indexed (the stores and Google look for them).
  const legal = /^legal\/(terms|privacy|returns)$/.exec(path);
  if (legal) {
    const titles = { terms: 'الشروط والأحكام', privacy: 'سياسة الخصوصية', returns: 'سياسة الاستبدال والإرجاع' } as const;
    const title = titles[legal[1] as keyof typeof titles];
    return { ...base, title: `${title} | ${SITE_NAME}`, description: clip(`${title} في ${SITE_NAME} — ${TAGLINE}.`) };
  }
  if (path.startsWith('legal/')) return { ...base, noindex: true, status: 404 };

  if (path === 'categories') {
    const { rows } = await db.query(
      `SELECT c.slug, c.name_ar FROM categories c LEFT JOIN categories pc ON pc.id = c.parent_id WHERE c.is_active AND (pc.id IS NULL OR pc.is_active) AND c.parent_id IS NULL ORDER BY c.sort_order, c.name_ar`,
    );
    return {
      ...base,
      title: `الأقسام | ${SITE_NAME}`,
      description: clip(`تسوّقي حسب القسم في ستايلو: ${rows.map((r) => r.name_ar).join('، ')}.`),
      summary: {
        heading: 'الأقسام',
        lines: [],
        links: rows.map((r) => ({ href: `/products?category=${encodeURIComponent(r.slug)}`, label: r.name_ar })),
      },
    };
  }

  if (path === 'products') {
    const category = query.get('category');
    const q = query.get('q');
    if (q) return { ...base, title: `نتائج «${clip(q, 40)}» | ${SITE_NAME}`, noindex: true };
    if (category) {
      const { rows } = await db.query(`SELECT c.name_ar FROM categories c LEFT JOIN categories pc ON pc.id = c.parent_id WHERE c.is_active AND (pc.id IS NULL OR pc.is_active) AND c.slug = $1`, [category]);
      if (rows[0]) {
        return {
          ...base,
          path: `/products?category=${encodeURIComponent(category)}`,
          title: `${rows[0].name_ar} | ${SITE_NAME}`,
          description: clip(`${rows[0].name_ar} من أفضل المتاجر الليبية على ستايلو، بالدينار الليبي مع توصيل سريع.`),
        };
      }
    }
    return { ...base, title: `كل المنتجات | ${SITE_NAME}` };
  }

  let m = /^product\/([0-9a-f-]{36})$/i.exec(path);
  if (m) {
    const { rows } = await db.query(
      `SELECT p.id, p.name_ar, p.description_ar, p.brand, p.base_price, p.compare_at_price, p.rating_avg,
              p.rating_count, s.name_ar AS store_name, s.slug AS store_slug, c.name_ar AS category_name,
              (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY sort_order LIMIT 1) AS image,
              (SELECT COALESCE(SUM(stock_qty), 0) FROM product_variants v WHERE v.product_id = p.id) AS stock
         FROM products p JOIN stores s ON s.id = p.store_id LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = $1 AND p.status = 'active' AND s.status = 'active'`,
      [m[1]],
    );
    const p = rows[0];
    if (!p) return { ...base, title: `المنتج غير متوفر | ${SITE_NAME}`, noindex: true, status: 404 };
    const price = Number(p.base_price);
    const onSale = p.compare_at_price && Number(p.compare_at_price) > price;
    const description = clip(
      `${p.name_ar} من «${p.store_name}» بسعر ${lyd(price)}${onSale ? ` بدل ${lyd(Number(p.compare_at_price))}` : ''}. ` +
        `${p.description_ar ?? ''} توصيل سريع في ليبيا والدفع عند الاستلام.`,
    );
    const ld: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name_ar,
      description: p.description_ar ?? undefined,
      image: p.image ? [p.image] : undefined,
      brand: { '@type': 'Brand', name: p.brand ?? p.store_name },
      category: p.category_name ?? undefined,
      offers: {
        '@type': 'Offer',
        url: `/${path}`,
        priceCurrency: 'LYD',
        price: (price / 1000).toFixed(3),
        availability: Number(p.stock) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: p.store_name },
      },
    };
    if (p.rating_count > 0) {
      ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: Number(p.rating_avg), reviewCount: p.rating_count };
    }
    return {
      title: `${p.name_ar} — ${p.store_name} | ${SITE_NAME}`,
      description,
      path: `/${path}`,
      image: p.image,
      type: 'product',
      jsonLd: [ld],
      summary: {
        heading: p.name_ar,
        lines: [`المتجر: ${p.store_name}`, `السعر: ${lyd(price)}`, ...(p.description_ar ? [p.description_ar] : [])],
        links: [{ href: `/store/${encodeURIComponent(p.store_slug)}`, label: `كل منتجات ${p.store_name}` }],
      },
    };
  }

  m = /^store\/([^/]+)$/.exec(path);
  if (m) {
    const slug = decodeURIComponent(m[1]!);
    const { rows } = await db.query(
      `SELECT id, slug, name_ar, description_ar, logo_url, cover_url, city FROM stores WHERE slug = $1 AND status = 'active'`,
      [slug],
    );
    const s = rows[0];
    if (!s) return { ...base, title: `المتجر غير موجود | ${SITE_NAME}`, noindex: true, status: 404 };
    const products = await db.query(
      `SELECT id, name_ar FROM products WHERE store_id = $1 AND status = 'active' ORDER BY is_featured DESC, sold_count DESC LIMIT 30`,
      [s.id],
    );
    return {
      title: `${s.name_ar} — ${s.city} | ${SITE_NAME}`,
      description: clip(`${s.description_ar ?? `تسوّقي من ${s.name_ar} في ${s.city}`} — على ستايلو مع توصيل سريع والدفع عند الاستلام.`),
      path: `/store/${encodeURIComponent(s.slug)}`,
      image: s.cover_url ?? s.logo_url,
      type: 'profile',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'ClothingStore',
          name: s.name_ar,
          description: s.description_ar ?? undefined,
          image: s.logo_url ?? undefined,
          address: { '@type': 'PostalAddress', addressLocality: s.city, addressCountry: 'LY' },
          url: `/store/${encodeURIComponent(s.slug)}`,
        },
      ],
      summary: {
        heading: s.name_ar,
        lines: [s.description_ar ?? '', `المدينة: ${s.city}`].filter(Boolean),
        links: products.rows.map((r) => ({ href: `/product/${r.id}`, label: r.name_ar })),
      },
    };
  }

  m = /^look\/([^/]+)$/.exec(path);
  if (m) {
    const key = decodeURIComponent(m[1]!);
    const { rows } = await db.query(
      `SELECT l.id, l.slug, l.title_ar, l.subtitle_ar, l.cover_url, s.name_ar AS store_name
         FROM looks l JOIN stores s ON s.id = l.store_id
        WHERE (l.slug = $1 OR l.id::text = $1) AND l.is_active AND s.status = 'active'`,
      [key],
    );
    const l = rows[0];
    if (!l) return { ...base, title: `اللوك غير موجود | ${SITE_NAME}`, noindex: true, status: 404 };
    return {
      title: `${l.title_ar} — ${l.store_name} | ${SITE_NAME}`,
      description: clip(`${l.subtitle_ar ?? 'كمّلي اللوك'}: لوك كامل من «${l.store_name}» تضيفينه إلى السلة بضغطة واحدة على ستايلو.`),
      path: `/look/${encodeURIComponent(l.slug)}`,
      image: l.cover_url,
      summary: { heading: l.title_ar, lines: [l.subtitle_ar ?? '', `من ${l.store_name}`].filter(Boolean) },
    };
  }

  return base;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Absolute URL from a site-relative path. */
function abs(origin: string, url: string): string {
  return /^https?:\/\//.test(url) ? url : `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** JSON-LD with site-relative URLs made absolute, safe inside <script>. */
function ldJson(origin: string, value: unknown): string {
  const json = JSON.stringify(value, (key, v) =>
    typeof v === 'string' && (key === 'url' || key === 'image') && v.startsWith('/') ? abs(origin, v) : v,
  );
  return json.replace(/</g, '\\u003c');
}

export function renderHead(meta: PageMeta, origin: string, cfg: SeoConfig): string {
  const url = abs(origin, meta.path);
  const index = cfg.indexing && !meta.noindex;
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}"/>`,
    `<meta name="robots" content="${index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow'}"/>`,
    `<meta name="theme-color" content="#0B1F2E"/>`,
    `<link rel="canonical" href="${esc(url)}"/>`,
    `<meta property="og:site_name" content="${SITE_NAME}"/>`,
    `<meta property="og:locale" content="ar_LY"/>`,
    `<meta property="og:type" content="${meta.type === 'product' ? 'product' : 'website'}"/>`,
    `<meta property="og:title" content="${esc(meta.title)}"/>`,
    `<meta property="og:description" content="${esc(meta.description)}"/>`,
    `<meta property="og:url" content="${esc(url)}"/>`,
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}"/>`,
    `<meta name="twitter:title" content="${esc(meta.title)}"/>`,
    `<meta name="twitter:description" content="${esc(meta.description)}"/>`,
  ];
  if (meta.image) {
    tags.push(`<meta property="og:image" content="${esc(abs(origin, meta.image))}"/>`);
    tags.push(`<meta name="twitter:image" content="${esc(abs(origin, meta.image))}"/>`);
  }
  if (cfg.googleSiteVerification) {
    tags.push(`<meta name="google-site-verification" content="${esc(cfg.googleSiteVerification)}"/>`);
  }
  for (const ld of meta.jsonLd ?? []) tags.push(`<script type="application/ld+json">${ldJson(origin, ld)}</script>`);
  return tags.join('');
}

export function renderNoscript(meta: PageMeta): string {
  if (!meta.summary) return '';
  const s = meta.summary;
  const links = (s.links ?? []).map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('');
  return (
    `<noscript><main dir="rtl"><h1>${esc(s.heading)}</h1>` +
    s.lines.map((l) => `<p>${esc(l)}</p>`).join('') +
    (links ? `<ul>${links}</ul>` : '') +
    `<p><a href="/">${SITE_NAME} — ${TAGLINE}</a></p></main></noscript>`
  );
}

/** Puts the tags into an Expo-exported HTML page (replacing its empty <title>). */
export function injectSeo(html: string, head: string, noscript: string): string {
  let out = html.replace(/<title[^>]*>[^<]*<\/title>/, '');
  // Right after <meta charset> (it must stay first), else at the top of <head>.
  const charset = /<meta charSet="utf-8"\/>/i;
  out = charset.test(out) ? out.replace(charset, (m) => m + head) : out.replace(/<head>/, `<head>${head}`);
  if (noscript) out = out.replace(/<body([^>]*)>/, `<body$1>${noscript}`);
  return out;
}

export function robotsTxt(origin: string, cfg: SeoConfig): string {
  if (!cfg.indexing) return 'User-agent: *\nDisallow: /\n';
  return [
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED_PATHS.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

export async function sitemapXml(db: Queryable, origin: string): Promise<string> {
  const [categories, stores, products, looks] = await Promise.all([
    db.query(`SELECT c.slug FROM categories c LEFT JOIN categories pc ON pc.id = c.parent_id WHERE c.is_active AND (pc.id IS NULL OR pc.is_active) ORDER BY c.parent_id NULLS FIRST, c.sort_order`),
    db.query(`SELECT slug, updated_at FROM stores WHERE status = 'active' ORDER BY slug`),
    db.query(
      `SELECT p.id, p.updated_at,
              (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY sort_order LIMIT 1) AS image
         FROM products p JOIN stores s ON s.id = p.store_id
        WHERE p.status = 'active' AND s.status = 'active'
        ORDER BY p.updated_at DESC LIMIT 45000`,
    ),
    db.query(
      `SELECT l.slug FROM looks l JOIN stores s ON s.id = l.store_id WHERE l.is_active AND s.status = 'active' ORDER BY l.sort_order`,
    ),
  ]);
  const url = (path: string, lastmod?: Date, image?: string | null) =>
    `<url><loc>${esc(abs(origin, path))}</loc>` +
    (lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : '') +
    (image ? `<image:image><image:loc>${esc(abs(origin, image))}</image:loc></image:image>` : '') +
    `</url>`;
  const entries = [
    url('/'),
    url('/categories'),
    url('/legal/terms'),
    url('/legal/privacy'),
    url('/legal/returns'),
    ...categories.rows.map((r) => url(`/products?category=${encodeURIComponent(r.slug)}`)),
    ...stores.rows.map((r) => url(`/store/${encodeURIComponent(r.slug)}`, r.updated_at)),
    ...looks.rows.map((r) => url(`/look/${encodeURIComponent(r.slug)}`)),
    ...products.rows.map((r) => url(`/product/${r.id}`, r.updated_at, r.image)),
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    entries.join('\n') +
    '\n</urlset>\n'
  );
}
