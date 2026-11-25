import { useState } from 'react';

import { useAdminReviews, useSetReviewHidden } from '@/api/hooks';
import { Phone } from '@/components/inputs';
import { Async, Badge, Empty, ErrorAlert, PageHead } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

const FILTERS = [
  { key: 'all', label: 'الكل', value: undefined },
  { key: 'shown', label: 'المعروضة', value: false },
  { key: 'hidden', label: 'المخفية', value: true },
] as const;

/**
 * «التقييمات» — moderation by the Stylo team (reviews.manage; stores never moderate reviews of
 * their own products). Only customers who received a product can review it; hiding a review takes
 * it out of the product page and of the product's rating.
 */
export function ReviewsPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const reviews = useAdminReviews(FILTERS.find((f) => f.key === filter)!.value);
  const toggle = useSetReviewHidden();

  return (
    <div className="stack">
      <PageHead
        title="التقييمات"
        subtitle="تقييمات الزبائن بعد الاستلام. أخفي التقييم المسيء أو الذي يحتوي بيانات شخصية؛ يُستبعد من صفحة المنتج ومن متوسط تقييمه."
      />
      <div className="row" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            className={`size-chip${filter === f.key ? ' on' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ErrorAlert error={toggle.error} />
      <Async query={reviews}>
        {({ items }) =>
          items.length === 0 ? (
            <Empty title="لا توجد تقييمات" hint="تظهر هنا تقييمات الزبائن بعد استلام طلباتهم." />
          ) : (
            <section className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th>التقييم</th>
                    <th>المنتج</th>
                    <th>الزبونة</th>
                    <th>التاريخ</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} style={r.hidden ? { opacity: 0.6 } : undefined}>
                      <td style={{ maxWidth: 360 }}>
                        <div aria-label={`${r.rating} من 5`} style={{ color: 'var(--stylo-star)', letterSpacing: 1 }}>
                          {'★'.repeat(r.rating)}
                          <span style={{ color: 'var(--faint)' }}>{'★'.repeat(5 - r.rating)}</span>
                        </div>
                        {r.body && <div style={{ marginTop: 4 }}>{r.body}</div>}
                        {r.hidden && <Badge tone="gray">مخفي</Badge>}
                      </td>
                      <td>
                        <div>{r.product.name}</div>
                        <div className="muted">{r.storeName}</div>
                      </td>
                      <td>
                        <div>{r.customer.name}</div>
                        <div className="muted">
                          <Phone value={r.customer.phone} />
                        </div>
                      </td>
                      <td className="muted">{formatDateTime(r.createdAt)}</td>
                      <td>
                        <button
                          className={`btn btn-sm ${r.hidden ? 'btn-ghost' : 'btn-danger'}`}
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate({ id: r.id, hidden: !r.hidden })}
                        >
                          {r.hidden ? 'إظهار' : 'إخفاء'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )
        }
      </Async>
    </div>
  );
}
