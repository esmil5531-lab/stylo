import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { useDashboard, useOrders } from '@/api/hooks';
import type { OrderStatus } from '@/api/types';
import { Money, Phone } from '@/components/inputs';
import { Async, Badge, Empty, OrderNo, PageHead } from '@/components/ui';
import { DELIVERY_MODE, ORDER_STATUS, ORDER_STATUSES } from '@/lib/constants';
import { timeAgo } from '@/lib/format';

const PAGE = 25;

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = ORDER_STATUSES.find((s) => s === params.get('status'));
  const q = params.get('q') ?? '';
  const offset = Number(params.get('offset') ?? 0);
  const [search, setSearch] = useState(q);

  const orders = useOrders({ status, q: q || undefined, offset });
  const counts = useDashboard().data?.ordersByStatus;
  const navigate = useNavigate();

  const update = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) (v ? p.set(k, v) : p.delete(k));
    if (!('offset' in next)) p.delete('offset');
    setParams(p);
  };

  const total = Object.values(counts ?? {}).reduce((s, n) => s + (n ?? 0), 0);

  return (
    <div className="stack">
      <PageHead title="الطلبات" subtitle="تابعي الطلبات وحرّكي حالاتها الست حتى التسليم" />

      <div className="row">
        <div className="tabs" role="tablist">
          <button className={`tab${!status ? ' active' : ''}`} onClick={() => update({ status: undefined })}>
            الكل<span className="count num">{total}</span>
          </button>
          {ORDER_STATUSES.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={status === s}
              className={`tab${status === s ? ' active' : ''}`}
              onClick={() => update({ status: s })}
            >
              {ORDER_STATUS[s].label}
              <span className="count num">{counts?.[s as OrderStatus] ?? 0}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search.trim() || undefined });
          }}
        >
          <input
            className="input"
            style={{ width: 260 }}
            placeholder="رقم الطلب، اسم أو هاتف العميل، المتجر"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </div>

      <section className="card">
        <Async query={orders}>
          {({ items, total: count }) =>
            items.length === 0 ? (
              <Empty title="لا توجد طلبات" hint={status ? `لا طلبات بحالة «${ORDER_STATUS[status].label}»` : undefined} />
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>الطلب</th>
                        <th>المتجر</th>
                        <th>العميل</th>
                        <th>المدينة</th>
                        <th>التوصيل</th>
                        <th>السائق</th>
                        <th>الإجمالي</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((o) => (
                        <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                          <td>
                            <div className="cell-title">
                              <OrderNo n={o.orderNumber} />
                            </div>
                            <div className="cell-sub">{timeAgo(o.placedAt)}</div>
                          </td>
                          <td>{o.store.name}</td>
                          <td>
                            <div>
                              {o.customer.name}
                              {o.customer.blocked ? (
                                <span className="refusal-flag" title="لا يستطيع إتمام طلبات جديدة">محظور</span>
                              ) : o.customer.refusals >= 2 ? (
                                <span className="refusal-flag" title="تعذّر التسليم: رفض الاستلام أو لم يرد">
                                  رفض {o.customer.refusals}
                                </span>
                              ) : null}
                            </div>
                            <div className="cell-sub">
                              <Phone value={o.customer.phone} />
                            </div>
                          </td>
                          <td>{o.city}</td>
                          <td>{DELIVERY_MODE[o.deliveryMode] ?? o.deliveryMode}</td>
                          <td>{o.driver?.name ?? <span className="muted">—</span>}</td>
                          <td className="strong">
                            <Money value={o.total} />
                          </td>
                          <td>
                            <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {count > PAGE && (
                  <div className="card-pad row">
                    <span className="muted small num">
                      {offset + 1}–{Math.min(offset + PAGE, count)} من {count}
                    </span>
                    <span className="spacer" />
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={offset === 0}
                      onClick={() => update({ offset: String(Math.max(0, offset - PAGE)) })}
                    >
                      السابق
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={offset + PAGE >= count}
                      onClick={() => update({ offset: String(offset + PAGE) })}
                    >
                      التالي
                    </button>
                  </div>
                )}
              </>
            )
          }
        </Async>
      </section>
    </div>
  );
}
