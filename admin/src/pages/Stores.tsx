import { useState } from 'react';

import { useCreateStore, useStores, useUpdateStore, type StoreInput } from '@/api/hooks';
import type { AdminStore, StoreStatus } from '@/api/types';
import { Can, useCan } from '@/components/Layout';
import { Async, Badge, Empty, ErrorAlert, Field, Icon, Modal, PageHead } from '@/components/ui';
import { LIBYAN_CITIES, STORE_STATUS } from '@/lib/constants';
import { dirhamsToInput, formatLYD, parseLYD } from '@/lib/format';

const STATUSES = Object.keys(STORE_STATUS) as StoreStatus[];

export function StoresPage() {
  const [status, setStatus] = useState<StoreStatus | undefined>();
  const stores = useStores({ status });
  const [editing, setEditing] = useState<AdminStore | 'new' | null>(null);
  const canWrite = useCan('stores.write');

  return (
    <div className="stack">
      <PageHead
        title="المتاجر"
        subtitle="أضيفي المتاجر وحدّدي منطقتها ورسوم التوصيل المباشر بالدينار الليبي وحالتها"
        actions={
          <Can permission="stores.write">
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              <Icon name="plus" />
              إضافة متجر
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
            {STORE_STATUS[s].label}
          </button>
        ))}
      </div>

      <section className="card">
        <Async query={stores}>
          {(items) =>
            items.length === 0 ? (
              <Empty title="لا توجد متاجر" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>المتجر</th>
                      <th>المنطقة</th>
                      <th>رسوم التوصيل المباشر</th>
                      <th>وقت التجهيز</th>
                      <th>المنتجات</th>
                      <th>طلبات مفتوحة</th>
                      <th>المالك</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((s) => (
                      <tr
                        key={s.id}
                        className={canWrite ? 'clickable' : undefined}
                        onClick={() => canWrite && setEditing(s)}
                      >
                        <td>
                          <div className="cell-title">
                            {s.nameAr} {s.isFeatured && <Badge tone="brand">مميز</Badge>}
                          </div>
                          <div className="cell-sub ltr">{s.nameEn ?? s.slug}</div>
                        </td>
                        <td>{s.city}</td>
                        <td className="num strong">{formatLYD(s.deliveryFee)}</td>
                        <td className="num">{s.prepHours} ساعات</td>
                        <td className="num">{s.productsCount}</td>
                        <td className="num">{s.openOrders}</td>
                        <td>
                          <div>{s.owner.name}</div>
                          <div className="cell-sub ltr">{s.owner.phone}</div>
                        </td>
                        <td>
                          <Badge tone={STORE_STATUS[s.status].tone}>{STORE_STATUS[s.status].label}</Badge>
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

      {editing && <StoreForm store={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StoreForm({ store, onClose }: { store: AdminStore | null; onClose: () => void }) {
  const create = useCreateStore();
  const update = useUpdateStore();
  const mutation = store ? update : create;

  const [f, setF] = useState({
    nameAr: store?.nameAr ?? '',
    nameEn: store?.nameEn ?? '',
    logoText: store?.logoText ?? '',
    city: store?.city ?? 'طرابلس',
    fee: store ? dirhamsToInput(store.deliveryFee) : '10',
    prepHours: String(store?.prepHours ?? 4),
    status: store?.status ?? ('pending_review' as StoreStatus),
    isFeatured: store?.isFeatured ?? false,
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const fee = parseLYD(f.fee);
  const valid =
    f.nameAr.trim().length >= 2 &&
    fee !== null &&
    Number(f.prepHours) >= 0 &&
    (store || (f.ownerName.trim().length >= 2 && f.ownerPhone.trim().length >= 9));

  const submit = () => {
    if (!valid || fee === null) return;
    const body: StoreInput = {
      nameAr: f.nameAr,
      nameEn: f.nameEn || null,
      logoText: f.logoText || null,
      city: f.city,
      deliveryFee: fee,
      prepHours: Number(f.prepHours),
      status: f.status,
      isFeatured: f.isFeatured,
    };
    if (store) update.mutate({ id: store.id, ...body }, { onSuccess: onClose });
    else
      create.mutate(
        { ...body, owner: { fullName: f.ownerName, phone: f.ownerPhone, email: f.ownerEmail || undefined } },
        { onSuccess: onClose },
      );
  };

  return (
    <Modal
      title={store ? `تعديل «${store.nameAr}»` : 'إضافة متجر جديد'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button className="btn btn-primary" disabled={!valid || mutation.isPending} onClick={submit}>
            {store ? 'حفظ التعديلات' : 'إضافة المتجر'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="اسم المتجر بالعربية">
          <input className="input" value={f.nameAr} onChange={(e) => set('nameAr', e.target.value)} autoFocus />
        </Field>
        <Field label="الاسم باللاتينية" hint="يُستخدم في رابط المتجر">
          <input className="input ltr" value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
        </Field>
        <Field label="المنطقة / المدينة">
          <select className="select" value={f.city} onChange={(e) => set('city', e.target.value)}>
            {LIBYAN_CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="رسوم التوصيل المباشر" hint={fee === null ? 'أدخلي رقماً صحيحاً، مثل 10 أو 12.5' : formatLYD(fee)}>
          <div className="input-affix">
            <input className="input num" inputMode="decimal" value={f.fee} onChange={(e) => set('fee', e.target.value)} />
            <span className="affix">د.ل</span>
          </div>
        </Field>
        <Field label="وقت تجهيز الطلب (ساعات)">
          <input
            className="input num"
            type="number"
            min={0}
            max={72}
            value={f.prepHours}
            onChange={(e) => set('prepHours', e.target.value)}
          />
        </Field>
        <Field label="الحالة">
          <select className="select" value={f.status} onChange={(e) => set('status', e.target.value as StoreStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STORE_STATUS[s].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="شعار نصي" hint="مثل LUNA — يظهر بدل الشعار حتى رفع صورة">
          <input className="input ltr" maxLength={12} value={f.logoText} onChange={(e) => set('logoText', e.target.value)} />
        </Field>
        <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}>
          <input type="checkbox" checked={f.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} />
          متجر مميز في الرئيسية
        </label>

        {!store && (
          <>
            <div className="form-section">صاحب/ة المتجر</div>
            <Field label="الاسم الكامل">
              <input className="input" value={f.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
            </Field>
            <Field label="رقم الهاتف" hint="مثال: 0912345678">
              <input
                className="input ltr"
                inputMode="tel"
                value={f.ownerPhone}
                onChange={(e) => set('ownerPhone', e.target.value)}
              />
            </Field>
            <Field label="البريد الإلكتروني (اختياري)" full>
              <input className="input ltr" type="email" value={f.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} />
            </Field>
          </>
        )}
      </div>
      <ErrorAlert error={mutation.error} />
    </Modal>
  );
}
