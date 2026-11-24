import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { useMe, useProducts, useStores } from '@/api/hooks';
import type { ProductStatus } from '@/api/types';
import { Money, Num } from '@/components/inputs';
import { Can, useCan } from '@/components/Layout';
import { Async, Badge, Empty, Icon, PageHead } from '@/components/ui';
import { mediaVariant } from '@/lib/media';
import { LOW_STOCK, PRODUCT_STATUS } from '@/lib/sizes';

const STATUSES = Object.keys(PRODUCT_STATUS) as ProductStatus[];

export function ProductsPage() {
  const me = useMe().data;
  const [status, setStatus] = useState<ProductStatus | undefined>();
  const [storeId, setStoreId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const products = useProducts({ status, q: q || undefined, storeId: storeId || undefined, lowStock });
  const stores = useStores({}, useCan('stores.read'));
  const navigate = useNavigate();
  const platform = !me?.store;

  return (
    <div className="stack">
      <PageHead
        title={me?.store ? `منتجات «${me.store.name}»` : 'المنتجات'}
        subtitle="الأسعار بالدينار الليبي، والمقاسات والكميات لكل منتج"
        actions={
          <Can permission="products.write">
            <Link to="/products/new" className="btn btn-primary">
              <Icon name="plus" />
              إضافة منتج
            </Link>
          </Can>
        }
      />

      <div className="row">
        <div className="tabs">
          <button className={`tab${!status ? ' active' : ''}`} onClick={() => setStatus(undefined)}>
            الكل
          </button>
          {STATUSES.map((s) => (
            <button key={s} className={`tab${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>
              {PRODUCT_STATUS[s].label}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} />
          كمية منخفضة فقط
        </label>
        <span className="spacer" />
        {platform && (
          <select className="select" style={{ width: 200 }} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">كل المتاجر</option>
            {stores.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameAr}
              </option>
            ))}
          </select>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQ(search.trim());
          }}
        >
          <input
            className="input"
            style={{ width: 240 }}
            placeholder="اسم المنتج، الماركة أو رمز SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </div>

      <section className="card">
        <Async query={products}>
          {(items) =>
            items.length === 0 ? (
              <Empty title="لا توجد منتجات" hint="أضيفي أول منتج مع مقاساته وكمياته" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      {platform && <th>المتجر</th>}
                      <th>المقاسات</th>
                      <th>المخزون</th>
                      <th>السعر</th>
                      <th>المبيعات</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.id} className="clickable" onClick={() => navigate(`/products/${p.id}`)}>
                        <td>
                          <div className="row" style={{ flexWrap: 'nowrap' }}>
                            <span className="thumb" style={{ background: tint(p.colorHex) }}>
                              {p.imageUrl ? <img src={mediaVariant(p.imageUrl, 320)} alt="" /> : null}
                            </span>
                            <div>
                              <div className="cell-title">{p.nameAr}</div>
                              <div className="cell-sub">
                                {[p.category?.name, p.brand].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                          </div>
                        </td>
                        {platform && <td>{p.store.name}</td>}
                        <td>
                          {p.sizes.length ? (
                            p.sizes.map((s) => (
                              <span key={s} className="chip ltr">
                                {s}
                              </span>
                            ))
                          ) : (
                            <span className="muted">مقاس واحد</span>
                          )}
                        </td>
                        <td>
                          <div className={p.stockTotal === 0 ? 'stock-out' : p.stockTotal <= LOW_STOCK ? 'stock-low' : ''}>
                            <Num>{p.stockTotal}</Num> قطعة
                          </div>
                          {p.soldOutVariants > 0 && (
                            <div className="cell-sub stock-out">
                              نفد <Num>{p.soldOutVariants}</Num> من <Num>{p.variantsCount}</Num>
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="strong">
                            <Money value={p.basePrice} />
                          </div>
                          {p.compareAtPrice && (
                            <div className="cell-sub" style={{ textDecoration: 'line-through' }}>
                              <Money value={p.compareAtPrice} />
                            </div>
                          )}
                        </td>
                        <td>
                          <Num>{p.soldCount}</Num>
                        </td>
                        <td>
                          <Badge tone={PRODUCT_STATUS[p.status].tone}>{PRODUCT_STATUS[p.status].label}</Badge>
                          {p.isFeatured && (
                            <div style={{ marginTop: 4 }}>
                              <Badge tone="brand">مميز</Badge>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </Async>
      </section>
    </div>
  );
}

function tint(hex: string | null): string {
  if (!hex) return 'var(--surface-2)';
  // 85% white over the product colour — same idea as the mobile placeholder.
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.82);
  return `rgb(${mix((n >> 16) & 255)} ${mix((n >> 8) & 255)} ${mix(n & 255)})`;
}
