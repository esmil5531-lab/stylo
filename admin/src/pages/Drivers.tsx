import { useState } from 'react';

import { useCreateDriver, useDrivers, useUpdateDriver } from '@/api/hooks';
import type { Driver, DriverStatus, Vehicle } from '@/api/types';
import { Can, useCan } from '@/components/Layout';
import { Count, Phone, PhoneInput } from '@/components/inputs';
import { Async, Badge, Empty, ErrorAlert, Field, Icon, Modal, PageHead } from '@/components/ui';
import { normaliseLibyanPhone } from '@/lib/numbers';
import { DRIVER_STATUS, LIBYAN_CITIES, VEHICLE } from '@/lib/constants';

const STATUSES = Object.keys(DRIVER_STATUS) as DriverStatus[];

export function DriversPage() {
  const [status, setStatus] = useState<DriverStatus | undefined>();
  const drivers = useDrivers({ status });
  const update = useUpdateDriver();
  const [adding, setAdding] = useState(false);
  const canWrite = useCan('drivers.write');

  return (
    <div className="stack">
      <PageHead
        title="السائقون"
        subtitle="أضيفي السائقين وتابعي توفرهم. تتحول الحالة إلى «في توصيلة» تلقائياً عند الشحن، وتعود «متاح» بعد التسليم"
        actions={
          <Can permission="drivers.write">
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Icon name="plus" />
              إضافة سائق
            </button>
          </Can>
        }
      />

      <div className="tabs">
        <button className={`tab${!status ? ' active' : ''}`} onClick={() => setStatus(undefined)}>
          الكل
        </button>
        {STATUSES.map((s) => (
          <button key={s} className={`tab${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>
            {DRIVER_STATUS[s].label}
          </button>
        ))}
      </div>
      <ErrorAlert error={update.error} />

      <section className="card">
        <Async query={drivers}>
          {(items) =>
            items.length === 0 ? (
              <Empty title="لا يوجد سائقون" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>السائق</th>
                      <th>المدينة</th>
                      <th>المركبة</th>
                      <th>طلبات قيد التوصيل</th>
                      <th>تم تسليمها</th>
                      <th>الحالة</th>
                      {canWrite && <th>تغيير التوفر</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((d) => (
                      <tr key={d.id} className={d.isActive ? undefined : 'inactive'}>
                        <td>
                          <div className="cell-title">{d.fullName}</div>
                          <div className="cell-sub">
                            <Phone value={d.phone} />
                          </div>
                        </td>
                        <td>{d.city}</td>
                        <td>
                          {VEHICLE[d.vehicle]}
                          {d.plateNumber && (
                            <div className="cell-sub">
                              <bdi dir="ltr">{d.plateNumber}</bdi>
                            </div>
                          )}
                        </td>
                        <td>
                          <Count value={d.activeOrders} />
                        </td>
                        <td>
                          <Count value={d.deliveredOrders} />
                        </td>
                        <td>
                          <Badge tone={d.isActive ? DRIVER_STATUS[d.status].tone : 'gray'}>
                            {d.isActive ? DRIVER_STATUS[d.status].label : 'موقوف'}
                          </Badge>
                        </td>
                        {canWrite && (
                          <td>
                            <AvailabilityActions driver={d} onChange={(v) => update.mutate({ id: d.id, ...v })} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </Async>
      </section>

      {adding && <DriverForm onClose={() => setAdding(false)} />}
    </div>
  );
}

function AvailabilityActions({
  driver,
  onChange,
}: {
  driver: Driver;
  onChange: (v: { status?: DriverStatus; isActive?: boolean }) => void;
}) {
  if (!driver.isActive) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => onChange({ isActive: true })}>
        إعادة تفعيل
      </button>
    );
  }
  if (driver.status === 'busy') return <span className="muted small">يتغير تلقائياً بعد التسليم</span>;
  return (
    <div className="row">
      {driver.status === 'offline' ? (
        <button className="btn btn-outline btn-sm" onClick={() => onChange({ status: 'available' })}>
          متاح للتوصيل
        </button>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => onChange({ status: 'offline' })}>
          غير متصل
        </button>
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => onChange({ isActive: false })}>
        إيقاف
      </button>
    </div>
  );
}

function DriverForm({ onClose }: { onClose: () => void }) {
  const create = useCreateDriver();
  const [f, setF] = useState({ fullName: '', phone: '', city: 'طرابلس', vehicle: 'motorcycle' as Vehicle, plateNumber: '' });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const [submitted, setSubmitted] = useState(false);
  const phone = normaliseLibyanPhone(f.phone);
  const errors = {
    fullName: f.fullName.trim().length < 2 ? 'اكتبي الاسم الكامل' : null,
    phone: !phone ? 'رقم ليبي غير صحيح، مثال: 0912345678' : null,
  };
  const show = (e: string | null) => (submitted ? e : null);
  const submit = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    create.mutate({ ...f, phone: phone!, plateNumber: f.plateNumber || undefined }, { onSuccess: onClose });
  };

  return (
    <Modal
      title="إضافة سائق"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button className="btn btn-primary" disabled={create.isPending} onClick={submit}>
            إضافة السائق
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="الاسم الكامل" required error={show(errors.fullName)}>
          <input className="input" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} autoFocus />
        </Field>
        <Field label="رقم الهاتف" required error={show(errors.phone)} hint="مثال: 0912345678">
          <PhoneInput value={f.phone} onChange={(v) => set('phone', v)} />
        </Field>
        <Field label="مدينة العمل">
          <select className="select" value={f.city} onChange={(e) => set('city', e.target.value)}>
            {LIBYAN_CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="نوع المركبة">
          <select className="select" value={f.vehicle} onChange={(e) => set('vehicle', e.target.value as Vehicle)}>
            {(Object.keys(VEHICLE) as Vehicle[]).map((v) => (
              <option key={v} value={v}>
                {VEHICLE[v]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="رقم اللوحة (اختياري)" full>
          <input className="input" dir="ltr" value={f.plateNumber} onChange={(e) => set('plateNumber', e.target.value)} />
        </Field>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        يُضاف السائق بحالة «غير متصل»؛ اجعليه «متاح للتوصيل» عند بدء نوبته.
      </p>
      <ErrorAlert error={create.error} />
    </Modal>
  );
}
