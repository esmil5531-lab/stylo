import { Link } from 'react-router';

import { useDashboard, useOrders } from '@/api/hooks';
import { Async, Badge, OrderNo, PageHead } from '@/components/ui';
import { DRIVER_STATUS, ORDER_STATUS, ORDER_STATUSES, STORE_STATUS } from '@/lib/constants';
import { formatLYD, timeAgo } from '@/lib/format';

export function DashboardPage() {
  const dash = useDashboard();
  const latest = useOrders({});

  return (
    <Async query={dash}>
      {(d) => {
        const open = (['pending', 'confirmed', 'processing', 'shipped'] as const).reduce(
          (s, k) => s + (d.ordersByStatus[k] ?? 0),
          0,
        );
        return (
          <div className="stack">
            <PageHead
              title={d.scope ? `لوحة متجر «${d.scope.storeName}»` : 'نظرة عامة'}
              subtitle="الأرقام بتوقيت ليبيا وتتحدث كل 30 ثانية"
            />

            <div className="grid grid-4">
              <Kpi label="مبيعات اليوم" value={formatLYD(d.today.sales)} hint={`${d.today.orders} طلب اليوم`} />
              <Kpi label="طلبات مفتوحة" value={String(open)} hint="تحتاج متابعة حتى التسليم" />
              {d.stores && (
                <Kpi
                  label="المتاجر النشطة"
                  value={String(d.stores.active ?? 0)}
                  hint={`${d.stores.pending_review ?? 0} ${STORE_STATUS.pending_review.label}`}
                />
              )}
              {d.drivers && (
                <Kpi
                  label="سائقون متاحون"
                  value={String(d.drivers.available ?? 0)}
                  hint={`${d.drivers.busy ?? 0} ${DRIVER_STATUS.busy.label}`}
                />
              )}
            </div>

            <section className="card card-pad">
              <div className="card-title">الطلبات حسب الحالة</div>
              <div className="status-strip">
                {ORDER_STATUSES.map((s) => (
                  <Link key={s} to={`/orders?status=${s}`} className="status-cell">
                    <Badge tone={ORDER_STATUS[s].tone}>{ORDER_STATUS[s].label}</Badge>
                    <div className="n num">{d.ordersByStatus[s] ?? 0}</div>
                  </Link>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="card-pad row">
                <div className="card-title" style={{ margin: 0 }}>
                  أحدث الطلبات
                </div>
                <span className="spacer" />
                <Link to="/orders" className="btn btn-ghost btn-sm">
                  كل الطلبات
                </Link>
              </div>
              <Async query={latest}>
                {(r) => (
                  <div className="table-wrap">
                    <table className="table">
                      <tbody>
                        {r.items.slice(0, 6).map((o) => (
                          <tr key={o.id}>
                            <td>
                              <Link to={`/orders/${o.id}`} className="cell-title">
                                <OrderNo n={o.orderNumber} />
                              </Link>
                              <div className="cell-sub">{timeAgo(o.placedAt)}</div>
                            </td>
                            <td>{o.store.name}</td>
                            <td>{o.customer.name}</td>
                            <td className="num strong">{formatLYD(o.total)}</td>
                            <td>
                              <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Async>
            </section>
          </div>
        );
      }}
    </Async>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}
