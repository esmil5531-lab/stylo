import { useState } from 'react';

import { useCreateStore, useStores, useUpdateStore, type StoreInput } from '@/api/hooks';
import type { AdminStore, StoreStatus } from '@/api/types';
import { Count, IntInput, Money, MoneyInput, Percent, PercentInput, Phone, PhoneInput, phoneToInput } from '@/components/inputs';
import { Can, useCan } from '@/components/Layout';
import { Async, Badge, Empty, ErrorAlert, Field, Icon, Modal, PageHead } from '@/components/ui';
import { LIBYAN_CITIES, STORE_STATUS } from '@/lib/constants';
import { dirhamsToInput, formatLYD, parseLYD } from '@/lib/format';
import { normaliseLibyanPhone, parseIntInput, parsePercent } from '@/lib/numbers';

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
        subtitle="المنطقة، رسوم التوصيل المباشر ونسبة العمولة بالدينار الليبي، وحالة كل متجر"
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
                      <th>العمولة</th>
                      <th>التجهيز</th>
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
                          <div className="cell-sub" dir="ltr" style={{ textAlign: 'right' }}>
                            {s.nameEn ?? s.slug}
                          </div>
                        </td>
                        <td>
                          {s.city}
                          {s.district && <div className="cell-sub">{s.district}</div>}
                        </td>
                        <td className="strong">
                          <Money value={s.deliveryFee} />
                        </td>
                        <td>
                          <Percent bps={s.commissionBps} />
                        </td>
                        <td>
                          <Count value={s.prepHours} /> ساعة
                        </td>
                        <td>
                          <Count value={s.productsCount} />
                        </td>
                        <td>
                          <Count value={s.openOrders} />
                        </td>
                        <td>
                          <div>{s.owner.name}</div>
                          <div className="cell-sub">
                            <Phone value={s.owner.phone} />
                          </div>
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
  const canCommission = useCan('stores.commission');

  const [f, setF] = useState({
    nameAr: store?.nameAr ?? '',
    nameEn: store?.nameEn ?? '',
    logoText: store?.logoText ?? '',
    city: store?.city ?? 'طرابلس',
    district: store?.district ?? '',
    addressLine: store?.addressLine ?? '',
    phone: phoneToInput(store?.phone),
    fee: store ? dirhamsToInput(store.deliveryFee) : '10',
    commission: String((store?.commissionBps ?? 1000) / 100),
    prepHours: String(store?.prepHours ?? 4),
    status: store?.status ?? ('pending_review' as StoreStatus),
    isFeatured: store?.isFeatured ?? false,
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const fee = parseLYD(f.fee);
  const commission = parsePercent(f.commission);
  const prep = parseIntInput(f.prepHours, 0, 72);
  const phone = f.phone.trim() ? normaliseLibyanPhone(f.phone) : null;
  const ownerPhone = normaliseLibyanPhone(f.ownerPhone);
  const errors = {
    nameAr: f.nameAr.trim().length < 2 ? 'اكتبي اسم المتجر بالعربية' : null,
    fee: fee === null ? 'رقم غير صحيح، مثل 10 أو 12.5' : fee > 500_000 ? 'أقصى رسوم 500 د.ل' : null,
    commission: commission === null || commission > 5000 ? 'نسبة من 0 إلى 50%' : null,
    prep: prep === null ? 'من 0 إلى 72 ساعة' : null,
    phone: f.phone.trim() && !phone ? 'رقم ليبي غير صحيح' : null,
    ownerName: !store && f.ownerName.trim().length < 2 ? 'اكتبي اسم صاحب/ة المتجر' : null,
    ownerPhone: !store && !ownerPhone ? 'رقم ليبي غير صحيح، مثال: 0912345678' : null,
    ownerEmail: !store && f.ownerEmail.trim() && !/^\S+@\S+\.\S+$/.test(f.ownerEmail) ? 'بريد غير صحيح' : null,
  };
  const show = (e: string | null) => (submitted ? e : null);

  const submit = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean) || fee === null || prep === null) return;
    const body: StoreInput = {
      nameAr: f.nameAr,
      nameEn: f.nameEn || null,
      logoText: f.logoText || null,
      city: f.city,
      district: f.district || null,
      addressLine: f.addressLine || null,
      phone: phone,
      deliveryFee: fee,
      prepHours: prep,
      status: f.status,
      isFeatured: f.isFeatured,
      ...(canCommission && commission !== null ? { commissionBps: commission } : {}),
    };
    if (store) update.mutate({ id: store.id, ...body }, { onSuccess: onClose });
    else
      create.mutate(
        { ...body, owner: { fullName: f.ownerName, phone: ownerPhone!, email: f.ownerEmail || undefined } },
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
          <button className="btn btn-primary" disabled={mutation.isPending} onClick={submit}>
            {store ? 'حفظ التعديلات' : 'إضافة المتجر'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-section" style={{ borderTop: 0, paddingTop: 0 }}>
          بيانات المتجر
        </div>
        <Field label="اسم المتجر بالعربية" required error={show(errors.nameAr)}>
          <input className="input" value={f.nameAr} onChange={(e) => set('nameAr', e.target.value)} autoFocus />
        </Field>
        <Field label="الاسم باللاتينية" hint="يُستخدم في رابط المتجر">
          <input className="input" dir="ltr" value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
        </Field>
        <Field label="شعار نصي" hint="مثل LUNA — يظهر حتى رفع صورة الشعار">
          <input
            className="input"
            dir="ltr"
            maxLength={12}
            value={f.logoText}
            onChange={(e) => set('logoText', e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="هاتف المتجر" error={show(errors.phone)} hint="اختياري — يُستخدم هاتف المالك إن تُرك فارغاً">
          <PhoneInput value={f.phone} onChange={(v) => set('phone', v)} />
        </Field>

        <div className="form-section">المنطقة والتوصيل</div>
        <Field label="المدينة" required>
          <select className="select" value={f.city} onChange={(e) => set('city', e.target.value)}>
            {LIBYAN_CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="الحي / المنطقة">
          <input className="input" value={f.district} onChange={(e) => set('district', e.target.value)} />
        </Field>
        <Field label="العنوان التفصيلي" hint="الشارع وأقرب معلم — نقطة استلام السائق" full>
          <input className="input" value={f.addressLine} onChange={(e) => set('addressLine', e.target.value)} />
        </Field>
        <Field
          label="رسوم التوصيل المباشر"
          required
          error={show(errors.fee)}
          hint={fee !== null ? `${formatLYD(fee)} — «توصيل عادي»؛ «أسرع توصيل» يضيف رسوماً` : undefined}
        >
          <MoneyInput value={f.fee} onChange={(v) => set('fee', v)} />
        </Field>
        <Field label="وقت تجهيز الطلب" required error={show(errors.prep)}>
          <IntInput value={f.prepHours} onChange={(v) => set('prepHours', v)} unit="ساعة" />
        </Field>

        <div className="form-section">الحالة والعمولة</div>
        <Field label="الحالة">
          <select className="select" value={f.status} onChange={(e) => set('status', e.target.value as StoreStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STORE_STATUS[s].label}
              </option>
            ))}
          </select>
        </Field>
        {canCommission ? (
          <Field
            label="نسبة عمولة ستايلو"
            required
            error={show(errors.commission)}
            hint="من قيمة المنتجات (دون التوصيل). تطبَّق على الطلبات الجديدة فقط"
          >
            <PercentInput value={f.commission} onChange={(v) => set('commission', v)} />
          </Field>
        ) : (
          <Field label="نسبة عمولة ستايلو" hint="يحددها المدير العام">
            <div className="readonly-value">
              <Percent bps={store?.commissionBps ?? 1000} />
            </div>
          </Field>
        )}
        <label className="check full">
          <input type="checkbox" checked={f.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} />
          متجر مميز في الرئيسية («متاجر مختارة لك»)
        </label>

        {!store && (
          <>
            <div className="form-section">صاحب/ة المتجر</div>
            <Field label="الاسم الكامل" required error={show(errors.ownerName)}>
              <input className="input" value={f.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
            </Field>
            <Field label="رقم الهاتف" required error={show(errors.ownerPhone)} hint="يُستخدم لدخول لوحة المتجر">
              <PhoneInput value={f.ownerPhone} onChange={(v) => set('ownerPhone', v)} />
            </Field>
            <Field label="البريد الإلكتروني" error={show(errors.ownerEmail)} full>
              <input
                className="input"
                dir="ltr"
                type="email"
                value={f.ownerEmail}
                onChange={(e) => set('ownerEmail', e.target.value)}
              />
            </Field>
            <p className="muted small full" style={{ margin: 0 }}>
              يحصل صاحب/ة المتجر تلقائياً على دور «مالك المتجر» لإدارة المنتجات والطلبات والتقارير الخاصة بالمتجر.
            </p>
          </>
        )}
      </div>
      <ErrorAlert error={mutation.error} />
    </Modal>
  );
}
