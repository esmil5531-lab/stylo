import { useState } from 'react';

import { useCreateReturn } from '@/api/hooks';
import type { AdminOrderDetail, ReturnReason } from '@/api/types';
import { formatDateTime } from '@/lib/format';

import { Count, Money, Num } from './inputs';
import { useCan } from './Layout';
import { Badge, ErrorAlert, Field, Modal } from './ui';

const REASONS: Record<ReturnReason, string> = {
  wrong_size: 'المقاس غير مناسب',
  defective: 'عيب أو تلف',
  not_as_described: 'لا يطابق الوصف أو الصور',
  changed_mind: 'غيّر رأيه',
  other: 'سبب آخر',
};

/**
 * «المرتجعات» on a delivered order: what came back, and «تسجيل إرجاع» (returns.manage) within the
 * returns window. Restocked unless defective; deducted from the store's next payout.
 */
export function OrderReturns({ order }: { order: AdminOrderDetail }) {
  const canRecord = useCan('returns.manage');
  const [open, setOpen] = useState(false);
  if (order.status !== 'delivered' && order.returns.length === 0) return null;
  const left = order.items.reduce((s, i) => s + i.quantity - i.returned, 0);

  return (
    <section className="card card-pad stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="card-title" style={{ margin: 0 }}>
          المرتجعات
        </div>
        {canRecord && order.canReturn && left > 0 && (
          <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
            تسجيل إرجاع
          </button>
        )}
      </div>
      {order.returns.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          لا مرتجعات.{' '}
          {order.returnDeadline &&
            (order.canReturn ? (
              <>يمكن تسجيل الإرجاع حتى {formatDateTime(order.returnDeadline)}.</>
            ) : (
              <>انتهت مدة الإرجاع ({formatDateTime(order.returnDeadline)}).</>
            ))}
        </p>
      ) : (
        order.returns.map((r) => (
          <div key={r.id} className="return-item">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>
                مرتجع <Num>#{r.number}</Num> · {r.reasonLabel}
              </strong>
              <Money value={r.amount} />
            </div>
            <div className="muted small">
              {r.items.map((i) => (
                <span key={i.orderItemId}>
                  {i.name}
                  {i.size && (
                    <>
                      {' '}
                      (<Num>{i.size}</Num>)
                    </>
                  )}{' '}
                  × <Num>{i.quantity}</Num>
                  {'  '}
                </span>
              ))}
            </div>
            <div className="row small" style={{ gap: 6 }}>
              <Badge tone={r.restocked ? 'green' : 'gray'}>{r.restocked ? 'عاد للمخزون' : 'لم يعد للمخزون'}</Badge>
              <Badge tone={r.settled ? 'brand' : 'amber'}>{r.settled ? 'خُصم من تسوية المتجر' : 'يُخصم في التسوية القادمة'}</Badge>
              <span className="muted">
                {formatDateTime(r.createdAt)}
                {r.createdBy ? ` · ${r.createdBy}` : ''}
              </span>
            </div>
            {r.note && <div className="small">{r.note}</div>}
          </div>
        ))
      )}
      {open && <ReturnDialog order={order} onClose={() => setOpen(false)} />}
    </section>
  );
}

function ReturnDialog({ order, onClose }: { order: AdminOrderDetail; onClose: () => void }) {
  const create = useCreateReturn(order.id);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [restock, setRestock] = useState(true);
  const [note, setNote] = useState('');
  const items = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
  const refund = order.items.reduce((s, i) => s + (qty[i.id] ?? 0) * i.unitPrice, 0);
  const pick = (r: ReturnReason) => {
    setReason(r);
    setRestock(r !== 'defective');
  };

  return (
    <Modal
      title={`تسجيل إرجاع — طلب #${order.orderNumber}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            تراجع
          </button>
          <button
            className="btn btn-primary"
            disabled={!reason || items.length === 0 || create.isPending}
            onClick={() =>
              create.mutate({ items, reason: reason!, restock, note: note.trim() || undefined }, { onSuccess: onClose })
            }
          >
            تسجيل الإرجاع واسترداد <Money value={refund} />
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        يُردّ للزبون ثمن القطع المرتجعة (دون رسوم التوصيل)، ويُخصم من مستحقات المتجر في تسويته القادمة.
      </p>
      <Field label="القطع المرتجعة" required group>
        <div className="stack" style={{ gap: 6 }}>
          {order.items.map((i) => {
            const left = i.quantity - i.returned;
            return (
              <label key={i.id} className="row return-line">
                <span style={{ flex: 1 }}>
                  {i.name}
                  {i.size && (
                    <>
                      {' '}
                      · المقاس <Num>{i.size}</Num>
                    </>
                  )}
                  <span className="muted small">
                    {' '}
                    · <Money value={i.unitPrice} /> · طُلب <Count value={i.quantity} />
                    {i.returned > 0 && (
                      <>
                        {' '}
                        · أُرجع <Count value={i.returned} />
                      </>
                    )}
                  </span>
                </span>
                <select
                  className="select"
                  style={{ width: 90 }}
                  aria-label={`عدد القطع المرتجعة من ${i.name}`}
                  disabled={left === 0}
                  value={qty[i.id] ?? 0}
                  onChange={(e) => setQty((q) => ({ ...q, [i.id]: Number(e.target.value) }))}
                >
                  {Array.from({ length: left + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </Field>
      <Field label="السبب" required group>
        <div className="size-chips">
          {(Object.keys(REASONS) as ReturnReason[]).map((k) => (
            <button key={k} type="button" className={`size-chip${reason === k ? ' on' : ''}`} aria-pressed={reason === k} onClick={() => pick(k)}>
              {REASONS[k]}
            </button>
          ))}
        </div>
      </Field>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
        إعادة القطع إلى مخزون المتجر (صالحة للبيع)
      </label>
      <Field label="ملاحظة (اختياري)" hint="لفريق ستايلو والمتجر فقط، لا تظهر للزبون">
        <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorAlert error={create.error} />
    </Modal>
  );
}
