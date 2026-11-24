import { useState } from 'react';

import { useCustody, useDriverCustody, useSettleCustody, useSettlement, useSettlements } from '@/api/hooks';
import type { CustodyBreakdown, CustodyRow, DriverCustody } from '@/api/types';
import { useCan } from '@/components/Layout';
import { Count, Money, MoneyInput, Num, Phone } from '@/components/inputs';
import { Async, Badge, Empty, ErrorAlert, Field, Modal, OrderNo, PageHead } from '@/components/ui';
import { DRIVER_STATUS } from '@/lib/constants';
import { dirhamsToInput, formatDateTime, parseLYD, timeAgo } from '@/lib/format';

/**
 * «عُهدة المناديب»: the cash each driver collected on cash-on-delivery orders and has not handed over
 * yet, with each store's net due, and «تقفيل العُهدة» when a staff member receives the money.
 * Commission columns appear for the general manager only (`finance.view`; the API strips them otherwise).
 */
export function CustodyPage() {
  const custody = useCustody();
  const canManage = useCan('custody.manage');
  const [openId, setOpenId] = useState<string | null>(null);
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const history = useSettlements();

  return (
    <div className="stack">
      <PageHead
        title="عُهدة المناديب"
        subtitle="المبالغ النقدية التي حصّلها المناديب من طلبات الدفع عند الاستلام ولم تُسلَّم بعد. عند استلام المبلغ اعملي «تقفيل العُهدة» فتعود العُهدة إلى صفر."
      />

      <Async query={custody}>
        {(data) => (
          <>
            <div className="kpi-grid">
              <div className="card kpi emph">
                <div className="kpi-label">إجمالي النقد لدى المناديب</div>
                <div className="kpi-value">
                  <Money value={data.total} />
                </div>
                <div className="kpi-hint">لم يُسلَّم لستايلو بعد</div>
              </div>
              <div className="card kpi">
                <div className="kpi-label">مناديب لديهم عُهدة</div>
                <div className="kpi-value">
                  <Count value={data.items.filter((i) => i.amount > 0).length} />
                </div>
              </div>
              <div className="card kpi">
                <div className="kpi-label">طلبات غير مقفلة</div>
                <div className="kpi-value">
                  <Count value={data.items.reduce((s, i) => s + i.ordersCount, 0)} />
                </div>
              </div>
            </div>

            <section className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>المندوب</th>
                      <th>الحالة</th>
                      <th>طلبات</th>
                      <th>متاجر</th>
                      <th>النقد في العُهدة</th>
                      <th>منذ</th>
                      <th>آخر تقفيل</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((r) => (
                      <DriverRow key={r.driver.id} row={r} onOpen={() => setOpenId(r.driver.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </Async>

      <section className="card">
        <div className="card-pad">
          <div className="card-title" style={{ margin: 0 }}>
            سجل تقفيل العُهد
          </div>
          <div className="muted small">كل استلام نقدي من مندوب: المبلغ، والفرق إن وُجد، ومن استلمه ومتى</div>
        </div>
        <Async query={history}>
          {(items) =>
            items.length === 0 ? (
              <Empty title="لا يوجد تقفيل بعد" />
            ) : (
              <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>التقفيل</th>
                      <th>المندوب</th>
                      <th>طلبات</th>
                      <th>المطلوب</th>
                      <th>المستلم</th>
                      <th>الفرق</th>
                      <th>استلمه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((s) => (
                      <tr key={s.id} className="clickable" onClick={() => setSettlementId(s.id)}>
                        <td>
                          <div className="cell-title">
                            <OrderNo n={s.number} />
                          </div>
                          <div className="cell-sub">{formatDateTime(s.settledAt)}</div>
                        </td>
                        <td>{s.driver.name}</td>
                        <td>
                          <Count value={s.ordersCount} />
                        </td>
                        <td>
                          <Money value={s.amountExpected} />
                        </td>
                        <td className="strong">
                          <Money value={s.amountReceived} />
                        </td>
                        <td>
                          <Difference value={s.difference} />
                        </td>
                        <td>
                          {s.receivedBy.name}
                          {s.note && <div className="cell-sub">{s.note}</div>}
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

      {openId && (
        <DriverCustodyDialog
          driverId={openId}
          canManage={canManage}
          onClose={() => setOpenId(null)}
          onSettled={(id) => {
            setOpenId(null);
            setSettlementId(id);
          }}
        />
      )}
      {settlementId && <SettlementDialog id={settlementId} onClose={() => setSettlementId(null)} />}
    </div>
  );
}

function DriverRow({ row: r, onOpen }: { row: CustodyRow; onOpen: () => void }) {
  return (
    <tr className="clickable" onClick={onOpen}>
      <td>
        <div className="cell-title">{r.driver.name}</div>
        <div className="cell-sub">
          <Phone value={r.driver.phone} /> · {r.driver.city}
        </div>
      </td>
      <td>
        <Badge tone={DRIVER_STATUS[r.driver.status].tone}>{DRIVER_STATUS[r.driver.status].label}</Badge>
      </td>
      <td>
        <Count value={r.ordersCount} />
      </td>
      <td>
        <Count value={r.storesCount} />
      </td>
      <td className="strong">{r.amount > 0 ? <Money value={r.amount} /> : <span className="muted">صفر</span>}</td>
      <td className="small">{r.since ? timeAgo(r.since) : '—'}</td>
      <td className="small">
        {r.lastSettlement ? (
          <>
            <Money value={r.lastSettlement.amountReceived} />
            <div className="cell-sub">
              {formatDateTime(r.lastSettlement.at)} · {r.lastSettlement.receivedBy}
            </div>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        <button className="btn btn-outline btn-sm" disabled={r.amount === 0}>
          التفاصيل والتقفيل
        </button>
      </td>
    </tr>
  );
}

function Difference({ value }: { value: number }) {
  if (value === 0) return <Badge tone="green">مطابق</Badge>;
  return (
    <Badge tone={value < 0 ? 'red' : 'amber'}>
      {value < 0 ? 'نقص' : 'زيادة'} <Money value={Math.abs(value)} />
    </Badge>
  );
}

/** Per-store table + order list, shared by the open custody and a past settlement. */
function Breakdown({ data }: { data: CustodyBreakdown }) {
  const finance = useCan('finance.view');
  return (
    <>
      <div className="form-section">صافي استحقاق كل متجر</div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>المتجر</th>
              <th>طلبات</th>
              <th>النقد المحصَّل</th>
              <th>صافي المتجر</th>
              {finance && <th>رسوم التوصيل</th>}
              {finance && <th>عمولة ستايلو</th>}
            </tr>
          </thead>
          <tbody>
            {data.byStore.map((b) => (
              <tr key={b.store.id}>
                <td className="cell-title">{b.store.name}</td>
                <td>
                  <Count value={b.ordersCount} />
                </td>
                <td>
                  <Money value={b.collected} />
                </td>
                <td className="strong">
                  <Money value={b.storeNet} />
                </td>
                {finance && (
                  <td>
                    <Money value={b.deliveryFees ?? 0} />
                  </td>
                )}
                {finance && (
                  <td>
                    <Money value={b.commission ?? 0} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="strong">
              <td>الإجمالي</td>
              <td>
                <Count value={data.totals.ordersCount} />
              </td>
              <td>
                <Money value={data.totals.amount} />
              </td>
              <td>
                <Money value={data.totals.storeNet} />
              </td>
              {finance && (
                <td>
                  <Money value={data.totals.deliveryFees ?? 0} />
                </td>
              )}
              {finance && (
                <td>
                  <Money value={data.totals.commission ?? 0} />
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="form-section">الطلبات</div>
      <div className="table-wrap" style={{ maxHeight: 220, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>الطلب</th>
              <th>المتجر</th>
              <th>الزبونة</th>
              <th>سُلِّم</th>
              <th>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {data.orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <OrderNo n={o.orderNumber} />
                </td>
                <td>{o.store.name}</td>
                <td>{o.customerName}</td>
                <td className="small">{formatDateTime(o.collectedAt)}</td>
                <td>
                  <Money value={o.total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DriverCustodyDialog({
  driverId,
  canManage,
  onClose,
  onSettled,
}: {
  driverId: string;
  canManage: boolean;
  onClose: () => void;
  onSettled: (settlementId: string) => void;
}) {
  const custody = useDriverCustody(driverId);
  return (
    <Async query={custody}>
      {(c) => <DriverCustodyBody c={c} canManage={canManage} onClose={onClose} onSettled={onSettled} />}
    </Async>
  );
}

function DriverCustodyBody({
  c,
  canManage,
  onClose,
  onSettled,
}: {
  c: DriverCustody;
  canManage: boolean;
  onClose: () => void;
  onSettled: (settlementId: string) => void;
}) {
  const settle = useSettleCustody();
  const [amount, setAmount] = useState(dirhamsToInput(c.totals.amount));
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const received = parseLYD(amount);
  const diff = received === null ? 0 : received - c.totals.amount;
  const errors = {
    amount: received === null ? 'اكتبي المبلغ المستلم بالدينار' : null,
    note: received !== null && diff !== 0 && !note.trim() ? 'المبلغ يختلف عن المطلوب: اكتبي السبب' : null,
  };

  const submit = () => {
    setSubmitted(true);
    if (errors.amount || errors.note || received === null) return;
    settle.mutate(
      { driverId: c.driver.id, amountReceived: received, expectedAmount: c.totals.amount, note: note.trim() || undefined },
      { onSuccess: (s) => onSettled(s.id) },
    );
  };

  return (
    <Modal
      title={`عُهدة ${c.driver.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            إغلاق
          </button>
          {canManage && c.totals.ordersCount > 0 && (
            <button className="btn btn-primary" disabled={settle.isPending} onClick={submit}>
              تقفيل العُهدة واستلام <Money value={received ?? 0} />
            </button>
          )}
        </>
      }
    >
      <dl className="kv">
        <dt>المندوب</dt>
        <dd>
          {c.driver.name} · <Phone value={c.driver.phone} />
        </dd>
        <dt>النقد المطلوب تسليمه</dt>
        <dd className="strong">
          <Money value={c.totals.amount} /> <span className="muted small">عن <Num>{c.totals.ordersCount}</Num> طلبات</span>
        </dd>
      </dl>

      {c.totals.ordersCount === 0 ? (
        <div className="alert alert-info">لا توجد مبالغ في عُهدة هذا المندوب.</div>
      ) : (
        <>
          <Breakdown data={c} />
          {canManage && (
            <>
              <div className="form-section">تقفيل العُهدة</div>
              <div className="form-grid">
                <Field label="المبلغ المستلم نقداً" required error={submitted ? errors.amount : null}>
                  <MoneyInput value={amount} onChange={setAmount} />
                </Field>
                <Field
                  label="ملاحظة"
                  required={diff !== 0}
                  error={submitted ? errors.note : null}
                  hint={diff !== 0 ? undefined : 'اختيارية'}
                >
                  <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                </Field>
              </div>
              {received !== null && diff !== 0 && (
                <div className="alert alert-error">
                  {diff < 0 ? 'نقص' : 'زيادة'} <Money value={Math.abs(diff)} /> عن المبلغ المطلوب
                </div>
              )}
              <div className="muted small">
                يُسجَّل التقفيل باسمك وبتاريخ ووقت الاستلام، وتعود عُهدة المندوب إلى صفر.
              </div>
            </>
          )}
        </>
      )}
      <ErrorAlert error={settle.error} />
    </Modal>
  );
}

function SettlementDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useSettlement(id);
  return (
    <Async query={s}>
      {(d) => (
        <Modal
          title={`تقفيل عُهدة ${d.driver.name}`}
          onClose={onClose}
          footer={
            <button className="btn btn-primary" onClick={onClose}>
              تم
            </button>
          }
        >
          <dl className="kv">
            <dt>رقم التقفيل</dt>
            <dd>
              <OrderNo n={d.number} />
            </dd>
            <dt>التاريخ والوقت</dt>
            <dd>{formatDateTime(d.settledAt)}</dd>
            <dt>استلمه</dt>
            <dd>{d.receivedBy.name}</dd>
            <dt>المطلوب</dt>
            <dd>
              <Money value={d.amountExpected} />
            </dd>
            <dt>المستلم</dt>
            <dd className="strong">
              <Money value={d.amountReceived} />
            </dd>
            <dt>الفرق</dt>
            <dd>
              <Difference value={d.difference} />
            </dd>
            {d.note && (
              <>
                <dt>ملاحظة</dt>
                <dd>{d.note}</dd>
              </>
            )}
          </dl>
          <Breakdown data={d} />
        </Modal>
      )}
    </Async>
  );
}
