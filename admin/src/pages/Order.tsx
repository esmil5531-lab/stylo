import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { useAssignDriver, useChangeOrderStatus, useDrivers, useOrder } from '@/api/hooks';
import type { AdminOrderDetail, OrderStatus } from '@/api/types';
import { useCan } from '@/components/Layout';
import { Count, Money, Num, Phone } from '@/components/inputs';
import { Async, Badge, ErrorAlert, Field, Icon, Modal, OrderNo, PageHead } from '@/components/ui';
import { DELIVERY_MODE, ORDER_STATUS, VEHICLE } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';

const PATH: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

export function OrderPage() {
  const { id = '' } = useParams();
  const order = useOrder(id);
  return <Async query={order}>{(o) => <OrderView order={o} />}</Async>;
}

function OrderView({ order }: { order: AdminOrderDetail }) {
  const canChange = useCan('orders.update_status');
  const canAssign = useCan('orders.assign_driver');
  const change = useChangeOrderStatus(order.id);
  const [note, setNote] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  const forward = order.allowedNext.filter((s) => s !== 'cancelled');
  const canCancel = order.allowedNext.includes('cancelled');
  const assignable = ['confirmed', 'processing'].includes(order.status);

  return (
    <div className="stack">
      <PageHead
        crumb={<Link to="/orders">الطلبات</Link>}
        title={
          <span className="row">
            <span>
              طلب <OrderNo n={order.orderNumber} />
            </span>
            <Badge tone={ORDER_STATUS[order.status].tone}>{ORDER_STATUS[order.status].label}</Badge>
          </span>
        }
        subtitle={`${order.store.name} · ${formatDateTime(order.placedAt)}`}
      />

      <div className="grid grid-2">
        <div className="stack">
          {canChange && (forward.length > 0 || canCancel) && (
            <section className="card card-pad stack">
              <div className="card-title" style={{ margin: 0 }}>
                الخطوة التالية
              </div>
              {forward.includes('shipped') && !order.driver && (
                <div className="alert alert-info">أسندي الطلب لسائق أولاً، ثم حوّليه إلى «تم الشحن».</div>
              )}
              <Field label="ملاحظة على التغيير (اختياري)">
                <input
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="تظهر في سجل الطلب"
                />
              </Field>
              <div className="row">
                {forward.map((s) => (
                  <button
                    key={s}
                    className="btn btn-primary"
                    disabled={change.isPending || (s === 'shipped' && !order.driver)}
                    onClick={() => change.mutate({ to: s, note: note || undefined }, { onSuccess: () => setNote('') })}
                  >
                    <Icon name="check" />
                    {ORDER_STATUS[s].action}
                  </button>
                ))}
                <span className="spacer" />
                {canCancel && (
                  <button className="btn btn-danger" onClick={() => setCancelOpen(true)} disabled={change.isPending}>
                    <Icon name="x" />
                    {order.status === 'shipped' ? 'تعذّر التسليم' : 'إلغاء الطلب'}
                  </button>
                )}
              </div>
              <ErrorAlert error={change.error} />
            </section>
          )}

          <section className="card">
            <div className="card-pad">
              <div className="card-title">المنتجات</div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>الكمية</th>
                    <th>السعر</th>
                    <th>المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <div className="cell-title">{it.name}</div>
                        <div className="cell-sub">
                          {it.colorName}
                          {it.size && (
                            <>
                              {it.colorName ? ' · ' : ''}المقاس <Num>{it.size}</Num>
                            </>
                          )}{' '}
                          · <Num>{it.sku}</Num>
                        </div>
                      </td>
                      <td>
                        <Count value={it.quantity} />
                      </td>
                      <td>
                        <Money value={it.unitPrice} />
                      </td>
                      <td className="strong">
                        <Money value={it.lineTotal} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-pad totals">
              <div className="row">
                <span className="muted">مجموع المنتجات</span>
                <Money value={order.subtotal} />
              </div>
              <div className="row">
                <span className="muted">التوصيل ({DELIVERY_MODE[order.deliveryMode] ?? order.deliveryMode})</span>
                <Money value={order.shippingFee} />
              </div>
              <div className="row strong">
                <span>الإجمالي</span>
                <Money value={order.total} />
              </div>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card card-pad">
            <div className="card-title">مسار الطلب</div>
            <Timeline order={order} />
          </section>

          <section className="card card-pad">
            <div className="card-title">السائق</div>
            {order.driver ? (
              <dl className="kv">
                <dt>الاسم</dt>
                <dd>{order.driver.name}</dd>
                <dt>الهاتف</dt>
                <dd>
                  <Phone value={order.driver.phone} />
                </dd>
              </dl>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                لم يُسند لسائق بعد.
              </p>
            )}
            {canAssign && assignable && <AssignDriver order={order} />}
          </section>

          <section className="card card-pad">
            <div className="card-title">العميل والتوصيل</div>
            <dl className="kv">
              <dt>العميل</dt>
              <dd>{order.customer.name}</dd>
              <dt>الهاتف</dt>
              <dd>
                <Phone value={order.shippingAddress.phone ?? order.customer.phone} />
              </dd>
              <dt>العنوان</dt>
              <dd>
                {[order.shippingAddress.city, order.shippingAddress.district, order.shippingAddress.street]
                  .filter(Boolean)
                  .join('، ')}
                {(order.shippingAddress.building || order.shippingAddress.landmark) && (
                  <div className="cell-sub">
                    {[order.shippingAddress.building, order.shippingAddress.landmark].filter(Boolean).join(' · ')}
                  </div>
                )}
              </dd>
              {order.cancelReason && (
                <>
                  <dt>سبب الإلغاء</dt>
                  <dd>{order.cancelReason}</dd>
                </>
              )}
            </dl>
          </section>
        </div>
      </div>

      {cancelOpen && (
        <CancelDialog
          failedDelivery={order.status === 'shipped'}
          onClose={() => setCancelOpen(false)}
          onConfirm={(reason, failureReason) =>
            change.mutate(
              { to: 'cancelled', cancelReason: reason || undefined, failureReason, note: note || undefined },
              { onSuccess: () => setCancelOpen(false) },
            )
          }
          pending={change.isPending}
          error={change.error}
        />
      )}
    </div>
  );
}

function Timeline({ order }: { order: AdminOrderDetail }) {
  const byStatus = new Map(order.history.map((h) => [h.to, h]));
  const cancelled = order.status === 'cancelled';
  const steps: OrderStatus[] = cancelled ? [...PATH.filter((s) => byStatus.has(s)), 'cancelled'] : PATH;
  return (
    <ol className="timeline">
      {steps.map((s) => {
        const h = byStatus.get(s);
        const cls = [h ? 'done' : '', s === order.status ? 'current' : '', s === 'cancelled' ? 'cancelled' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <li key={s} className={cls}>
            <span className="dot">{h && <Icon name={s === 'cancelled' ? 'x' : 'check'} size={13} />}</span>
            <div>
              <div className="tl-title">{ORDER_STATUS[s].label}</div>
              {h ? (
                <div className="tl-meta">
                  {formatDateTime(h.at)}
                  {h.by ? ` · ${h.by}` : ''}
                  {h.note ? ` — ${h.note}` : ''}
                </div>
              ) : (
                <div className="tl-meta">لم تتم بعد</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function AssignDriver({ order }: { order: AdminOrderDetail }) {
  // Drivers in the customer's city first, then everyone available.
  const drivers = useDrivers({ status: 'available' });
  const assign = useAssignDriver(order.id);
  const [driverId, setDriverId] = useState('');
  const list = (drivers.data ?? []).filter((d) => d.isActive && d.id !== order.driver?.id);
  const sorted = [...list].sort((a, b) => Number(b.city === order.city) - Number(a.city === order.city));

  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <Field label={order.driver ? 'تغيير السائق' : 'إسناد لسائق متاح'}>
        <select className="select" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
          <option value="">اختاري سائقاً…</option>
          {sorted.map((d) => (
            <option key={d.id} value={d.id}>
              {d.fullName} — {d.city} · {VEHICLE[d.vehicle]}
              {d.city === order.city ? ' (نفس المدينة)' : ''}
            </option>
          ))}
        </select>
      </Field>
      {drivers.isSuccess && sorted.length === 0 && <div className="muted small">لا يوجد سائقون متاحون الآن.</div>}
      <button
        className="btn btn-outline"
        disabled={!driverId || assign.isPending}
        onClick={() => assign.mutate(driverId, { onSuccess: () => setDriverId('') })}
      >
        إسناد الطلب
      </button>
      <ErrorAlert error={assign.error} />
    </div>
  );
}

/** Owner-approved reasons for «تعذّر التسليم» (same list as the driver app and the API). */
const DELIVERY_FAILURES = {
  no_answer: 'الزبون لا يرد',
  refused: 'رفض الاستلام',
  wrong_address: 'عنوان غير صحيح',
  postponed: 'تأجيل من الزبون',
} as const;
type DeliveryFailure = keyof typeof DELIVERY_FAILURES;

function CancelDialog({
  failedDelivery,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  /** The parcel is with the driver: «تعذّر التسليم» with a reason from the list. */
  failedDelivery: boolean;
  onClose: () => void;
  onConfirm: (reason: string, failureReason?: DeliveryFailure) => void;
  pending: boolean;
  error: unknown;
}) {
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<DeliveryFailure | null>(null);
  const ready = failedDelivery ? failure !== null : reason.trim().length > 0;
  return (
    <Modal
      title={failedDelivery ? 'تعذّر التسليم' : 'إلغاء الطلب'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            تراجع
          </button>
          <button
            className="btn btn-danger"
            disabled={!ready || pending}
            onClick={() => onConfirm(reason.trim(), failure ?? undefined)}
          >
            {failedDelivery ? 'تسجيل تعذّر التسليم' : 'تأكيد الإلغاء'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        {failedDelivery
          ? 'يُلغى الطلب ولا يُحصَّل أي مبلغ، وتعود القطع إلى مخزون المتجر. على المندوب إرجاعها للمتجر.'
          : 'سيُعاد المخزون إلى المتجر ولا يمكن التراجع عن الإلغاء.'}
      </p>
      {failedDelivery && (
        <Field label="السبب" required group>
          <div className="size-chips">
            {(Object.keys(DELIVERY_FAILURES) as DeliveryFailure[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`size-chip${failure === k ? ' on' : ''}`}
                aria-pressed={failure === k}
                onClick={() => setFailure(k)}
              >
                {DELIVERY_FAILURES[k]}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field
        label={failedDelivery ? 'ملاحظة (اختياري)' : 'سبب الإلغاء'}
        required={!failedDelivery}
        hint="يظهر للعميلة في تفاصيل الطلب"
      >
        <textarea className="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus={!failedDelivery} />
      </Field>
      <ErrorAlert error={error} />
    </Modal>
  );
}
