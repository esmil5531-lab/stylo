import { useState } from 'react';

import {
  useBalances,
  useCancelPayout,
  useCreatePayout,
  useMarkPaid,
  useMe,
  usePayout,
  usePayoutPreview,
  usePayouts,
  useVerifyStoreBank,
} from '@/api/hooks';
import type { Payout, StoreBalance, StoreBank } from '@/api/types';
import { Count, Money, Num, Percent } from '@/components/inputs';
import { useCan } from '@/components/Layout';
import { Async, Badge, Empty, ErrorAlert, Field, Modal, OrderNo, PageHead } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

const STATUS = {
  pending: { label: 'معلّقة — بانتظار التحويل', short: 'معلّقة', tone: 'amber' as const },
  paid: { label: 'مدفوعة', short: 'مدفوعة', tone: 'green' as const },
};

function libyaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli' }).format(new Date());
}

/**
 * «مستحقات المتاجر»: what each store is owed for delivered orders, settlements per period,
 * and the record of every settlement (pending → paid with the transfer reference).
 */
export function PayoutsPage() {
  const me = useMe().data;
  const canManage = useCan('payouts.manage');
  const finance = useCan('finance.view');
  const balances = useBalances();
  const [status, setStatus] = useState<'pending' | 'paid' | undefined>();
  const payouts = usePayouts({ status });
  const [settling, setSettling] = useState<StoreBalance | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="stack">
      <PageHead
        title={me?.store ? `مستحقات «${me.store.name}»` : 'مستحقات المتاجر والتسويات'}
        subtitle={
          finance
            ? 'المستحق = قيمة المنتجات في الطلبات المسلّمة ناقص عمولة ستايلو. رسوم التوصيل لستايلو.'
            : 'المبالغ المستحقة عن الطلبات المسلّمة وسجل التحويلات.'
        }
      />

      <section className="card">
        <div className="card-pad">
          <div className="card-title" style={{ margin: 0 }}>
            الرصيد غير المسوّى
          </div>
          <div className="muted small">الطلبات المسلّمة التي لم تدخل في أي تسوية بعد</div>
        </div>
        <Async query={balances}>
          {(items) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>المتجر</th>
                    {finance && <th>العمولة</th>}
                    <th>طلبات مسلّمة</th>
                    <th>المبيعات</th>
                    {finance && <th>عمولة ستايلو</th>}
                    <th>مرتجعات تُخصم</th>
                    <th>المستحق للمتجر</th>
                    <th>الفترة</th>
                    <th>معلّق للتحويل</th>
                    {canManage && <th />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((b) => (
                    <tr key={b.storeId}>
                      <td className="cell-title">{b.storeName}</td>
                      {finance && (
                        <td>
                          <Percent bps={b.commissionBps ?? 0} />
                        </td>
                      )}
                      <td>
                        <Count value={b.unsettled.orders} />
                      </td>
                      <td>
                        <Money value={b.unsettled.sales} />
                      </td>
                      {finance && (
                        <td>
                          <Money value={b.unsettled.commission ?? 0} />
                        </td>
                      )}
                      <td>
                        {b.unsettled.returnsCount > 0 ? (
                          <>
                            − <Money value={b.unsettled.returnsAmount} />{' '}
                            <span className="muted small">
                              (<Count value={b.unsettled.returnsCount} />)
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="strong">
                        <Money value={b.unsettled.payout} />
                      </td>
                      <td className="small">
                        {b.unsettled.firstDay ? (
                          <>
                            من <Num>{b.unsettled.firstDay}</Num> إلى <Num>{b.unsettled.lastDay}</Num>
                          </>
                        ) : (
                          <span className="muted">لا يوجد</span>
                        )}
                      </td>
                      <td>{b.pendingAmount > 0 ? <Money value={b.pendingAmount} /> : <span className="muted">—</span>}</td>
                      {canManage && (
                        <td>
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={b.unsettled.orders === 0}
                            onClick={() => setSettling(b)}
                          >
                            تسوية
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </section>

      <section className="card">
        <div className="card-pad row">
          <div className="card-title" style={{ margin: 0 }}>
            سجل التسويات
          </div>
          <span className="spacer" />
          <div className="tabs">
            <button className={`tab${!status ? ' active' : ''}`} onClick={() => setStatus(undefined)}>
              الكل
            </button>
            <button className={`tab${status === 'pending' ? ' active' : ''}`} onClick={() => setStatus('pending')}>
              معلّقة
            </button>
            <button className={`tab${status === 'paid' ? ' active' : ''}`} onClick={() => setStatus('paid')}>
              مدفوعة
            </button>
          </div>
        </div>
        <Async query={payouts}>
          {(items) =>
            items.length === 0 ? (
              <Empty title="لا توجد تسويات بعد" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>التسوية</th>
                      <th>المتجر</th>
                      <th>الفترة</th>
                      <th>الطلبات</th>
                      <th>المبيعات</th>
                      {finance && <th>العمولة</th>}
                      <th>المستحق</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.id} className="clickable" onClick={() => setOpenId(p.id)}>
                        <td>
                          <div className="cell-title">
                            <OrderNo n={p.number} />
                          </div>
                          <div className="cell-sub">{formatDateTime(p.createdAt)}</div>
                        </td>
                        <td>{p.store.name}</td>
                        <td className="small">
                          من <Num>{p.from}</Num> إلى <Num>{p.to}</Num>
                        </td>
                        <td>
                          <Count value={p.ordersCount} />
                        </td>
                        <td>
                          <Money value={p.sales} />
                        </td>
                        {finance && (
                          <td>
                            <Money value={p.commission ?? 0} />
                          </td>
                        )}
                        <td className="strong">
                          <Money value={p.payoutAmount} />
                        </td>
                        <td>
                          <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].short}</Badge>
                          {p.reference && (
                            <div className="cell-sub">
                              رقم التحويل: <Num>{p.reference}</Num>
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

      {settling && <SettleDialog balance={settling} onClose={() => setSettling(null)} onCreated={setOpenId} />}
      {openId && <PayoutDialog id={openId} canManage={canManage} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function SettleDialog({
  balance,
  onClose,
  onCreated,
}: {
  balance: StoreBalance;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const finance = useCan('finance.view');
  const [from, setFrom] = useState(balance.unsettled.firstDay ?? libyaToday());
  const [to, setTo] = useState(balance.unsettled.lastDay ?? libyaToday());
  const [note, setNote] = useState('');
  const preview = usePayoutPreview({ storeId: balance.storeId, from, to });
  const create = useCreatePayout();

  return (
    <Modal
      title={`تسوية مستحقات «${balance.storeName}»`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button
            className="btn btn-primary"
            disabled={!preview.data?.ordersCount || create.isPending}
            onClick={() =>
              create.mutate(
                { storeId: balance.storeId, from, to, note: note || undefined },
                {
                  onSuccess: (p) => {
                    onClose();
                    onCreated(p.id);
                  },
                },
              )
            }
          >
            إنشاء التسوية
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="من (تاريخ التسليم)" required>
          <input type="date" className="input" dir="ltr" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="إلى" required>
          <input type="date" className="input" dir="ltr" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="ملاحظة" full>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" />
        </Field>
      </div>
      <Async query={preview}>
        {(p) =>
          p.ordersCount === 0 ? (
            <div className="alert alert-info">لا توجد طلبات مسلّمة غير مسوّاة في هذه الفترة.</div>
          ) : (
            <dl className="kv">
              <dt>الطلبات المسلّمة</dt>
              <dd>
                <Count value={p.ordersCount} />
              </dd>
              <dt>المبيعات</dt>
              <dd>
                <Money value={p.sales} />
              </dd>
              {finance && (
                <>
                  <dt>عمولة ستايلو</dt>
                  <dd>
                    <Money value={p.commission ?? 0} />
                  </dd>
                </>
              )}
              {p.returnsCount > 0 && <ReturnsRows count={p.returnsCount} amount={p.returnsAmount} commission={p.returnsCommission} />}
              <dt>المستحق للمتجر</dt>
              <dd className="strong">
                <Money value={p.payout} />
              </dd>
            </dl>
          )
        }
      </Async>
      <p className="muted small" style={{ margin: 0 }}>
        تُنشأ التسوية «معلّقة»، وبعد التحويل سجّلي رقم الحوالة لتصبح «مدفوعة». كل طلب يُسوّى مرة واحدة فقط.
      </p>
      <ErrorAlert error={create.error} />
    </Modal>
  );
}

function PayoutDialog({ id, canManage, onClose }: { id: string; canManage: boolean; onClose: () => void }) {
  const payout = usePayout(id);
  const markPaid = useMarkPaid();
  const cancel = useCancelPayout();
  const finance = useCan('finance.view');
  const [reference, setReference] = useState('');

  return (
    <Async query={payout}>
      {(p) => (
        <Modal
          title={`تسوية رقم ${p.number} — ${p.store.name}`}
          onClose={onClose}
          footer={
            p.status === 'pending' && canManage ? (
              <>
                <button
                  className="btn btn-danger"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(p.id, { onSuccess: onClose })}
                >
                  إلغاء التسوية
                </button>
                <span className="spacer" />
                <button
                  className="btn btn-primary"
                  disabled={reference.trim().length < 2 || markPaid.isPending}
                  onClick={() => markPaid.mutate({ id: p.id, reference })}
                >
                  تسجيل الدفع
                </button>
              </>
            ) : (
              <button className="btn btn-ghost" onClick={onClose}>
                إغلاق
              </button>
            )
          }
        >
          <PayoutSummary p={p} />
          {p.bank && <BankBox storeId={p.store.id} bank={p.bank} pending={p.status === 'pending'} />}
          {p.status === 'pending' && canManage && (
            <Field label="رقم الحوالة / الإيصال" required hint="يُحفظ في سجل التسوية">
              <input className="input" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          )}
          <div className="table-wrap" style={{ maxHeight: 260, overflow: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>الطلب</th>
                  <th>قيمة المنتجات</th>
                  {finance && <th>العمولة</th>}
                  <th>المستحق</th>
                </tr>
              </thead>
              <tbody>
                {p.orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <OrderNo n={o.orderNumber} />
                    </td>
                    <td>
                      <Money value={o.subtotal} />
                    </td>
                    {finance && (
                      <td>
                        <Money value={o.commission ?? 0} />{' '}
                        <span className="muted small">
                          (<Percent bps={o.commissionBps ?? 0} />)
                        </span>
                      </td>
                    )}
                    <td>
                      <Money value={o.payout} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.returns.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>المرتجع</th>
                    <th>الطلب</th>
                    <th>قيمة المرتجع</th>
                    <th>الخصم من المستحق</th>
                  </tr>
                </thead>
                <tbody>
                  {p.returns.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <OrderNo n={r.number} />
                      </td>
                      <td>
                        <OrderNo n={r.orderNumber} />
                      </td>
                      <td>
                        <Money value={r.amount} />
                      </td>
                      <td>
                        − <Money value={r.deduction} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ErrorAlert error={markPaid.error ?? cancel.error} />
        </Modal>
      )}
    </Async>
  );
}

function PayoutSummary({ p }: { p: Payout }) {
  const finance = useCan('finance.view');
  return (
    <dl className="kv">
      <dt>الحالة</dt>
      <dd>
        <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
      </dd>
      <dt>الفترة</dt>
      <dd>
        من <Num>{p.from}</Num> إلى <Num>{p.to}</Num>
      </dd>
      <dt>المبيعات</dt>
      <dd>
        <Money value={p.sales} />
      </dd>
      {finance && (
        <>
          <dt>عمولة ستايلو</dt>
          <dd>
            <Money value={p.commission ?? 0} />
          </dd>
        </>
      )}
      {p.returnsCount > 0 && <ReturnsRows count={p.returnsCount} amount={p.returnsAmount} commission={p.returnsCommission} />}
      <dt>المستحق للمتجر</dt>
      <dd className="strong">
        <Money value={p.payoutAmount} />
      </dd>
      <dt>أنشأها</dt>
      <dd>
        {p.createdBy ?? '—'} · {formatDateTime(p.createdAt)}
      </dd>
      {p.paidAt && (
        <>
          <dt>دُفعت</dt>
          <dd>
            {p.paidBy} · {formatDateTime(p.paidAt)} · رقم الحوالة <Num>{p.reference}</Num>
          </dd>
        </>
      )}
      {p.note && (
        <>
          <dt>ملاحظة</dt>
          <dd>{p.note}</dd>
        </>
      )}
    </dl>
  );
}

/** Returns deducted from the store's dues (Stylo gives back its commission on them). */
function ReturnsRows({ count, amount, commission }: { count: number; amount: number; commission?: number }) {
  const finance = useCan('finance.view');
  return (
    <>
      <dt>
        مرتجعات (<Count value={count} />)
      </dt>
      <dd>
        − <Money value={amount} />
      </dd>
      {finance && commission !== undefined && (
        <>
          <dt>عمولة مستردة على المرتجعات</dt>
          <dd>
            + <Money value={commission} />
          </dd>
        </>
      )}
    </>
  );
}

/** The store's bank account on a payout, with the general manager's «توثيق». */
function BankBox({ storeId, bank, pending }: { storeId: string; bank: StoreBank; pending: boolean }) {
  const canVerify = useCan('stores.bank');
  const verify = useVerifyStoreBank(storeId);
  if (!bank.complete) {
    return <div className="alert alert-warn">لم يُدخل المتجر بيانات حسابه البنكي بعد (من «إعدادات متجري»).</div>;
  }
  return (
    <div className="card card-pad bank-box">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>التحويل إلى</strong>
        <Badge tone={bank.verified ? 'green' : 'amber'}>{bank.verified ? 'حساب موثّق' : 'غير موثّق'}</Badge>
      </div>
      <dl className="kv">
        <dt>المصرف</dt>
        <dd>{bank.bankName}</dd>
        <dt>اسم الحساب</dt>
        <dd>{bank.accountName}</dd>
        <dt>IBAN</dt>
        <dd>
          <Num>{bank.iban}</Num>
        </dd>
        {bank.accountNumber && (
          <>
            <dt>رقم الحساب</dt>
            <dd>
              <Num>{bank.accountNumber}</Num>
            </dd>
          </>
        )}
      </dl>
      {!bank.verified && pending && (
        <div className="alert alert-warn small">
          الحساب تغيّر أو لم يُراجع بعد{bank.updatedBy ? ` (آخر تعديل: ${bank.updatedBy})` : ''}. تأكد منه مع المتجر قبل التحويل.
        </div>
      )}
      {!bank.verified && canVerify && (
        <button className="btn btn-outline btn-sm" disabled={verify.isPending} onClick={() => verify.mutate()}>
          توثيق الحساب البنكي
        </button>
      )}
      {bank.verified && bank.verifiedBy && (
        <div className="muted small">
          وثّقه {bank.verifiedBy} · {bank.verifiedAt ? formatDateTime(bank.verifiedAt) : ''}
        </div>
      )}
      <ErrorAlert error={verify.error} />
    </div>
  );
}
