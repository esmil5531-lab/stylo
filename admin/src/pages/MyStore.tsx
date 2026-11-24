import { useState } from 'react';

import { useMyStore, useUpdateMyStore } from '@/api/hooks';
import type { AdminStore } from '@/api/types';
import { IntInput, Money, PhoneInput, phoneToInput } from '@/components/inputs';
import { Async, Badge, Empty, ErrorAlert, Field, PageHead } from '@/components/ui';
import { STORE_STATUS } from '@/lib/constants';
import { normaliseLibyanPhone, parseIntInput } from '@/lib/numbers';

/** «إعدادات متجري»: what a store can change about itself. */
export function MyStorePage() {
  const store = useMyStore();
  return (
    <Async query={store}>
      {(s) => (s ? <MyStoreForm key={s.id} store={s} /> : <Empty title="هذه الصفحة لموظفي المتاجر" />)}
    </Async>
  );
}

function MyStoreForm({ store }: { store: AdminStore }) {
  const update = useUpdateMyStore();
  const [f, setF] = useState({
    nameAr: store.nameAr,
    nameEn: store.nameEn ?? '',
    logoText: store.logoText ?? '',
    phone: phoneToInput(store.phone),
    district: store.district ?? '',
    addressLine: store.addressLine ?? '',
    prepHours: String(store.prepHours),
  });
  const [submitted, setSubmitted] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    update.reset();
  };

  const phone = f.phone.trim() ? normaliseLibyanPhone(f.phone) : null;
  const prep = parseIntInput(f.prepHours, 0, 72);
  const errors = {
    nameAr: f.nameAr.trim().length < 2 ? 'اكتبي اسم المتجر' : null,
    phone: f.phone.trim() && !phone ? 'رقم ليبي غير صحيح، مثال: 0912345678' : null,
    prepHours: prep === null ? 'من 0 إلى 72 ساعة' : null,
  };
  const show = (e: string | null) => (submitted ? e : null);

  const submit = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean) || prep === null) return;
    update.mutate({
      nameAr: f.nameAr,
      nameEn: f.nameEn || null,
      logoText: f.logoText || null,
      phone: phone ?? null,
      district: f.district || null,
      addressLine: f.addressLine || null,
      prepHours: prep,
    });
  };

  return (
    <div className="stack">
      <PageHead title="إعدادات متجري" subtitle={`${store.nameAr} · ${store.city}`} />

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <section className="card section-card">
            <h2>بيانات المتجر</h2>
            <div className="form-grid">
              <Field label="اسم المتجر بالعربية" required error={show(errors.nameAr)}>
                <input className="input" value={f.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
              </Field>
              <Field label="الاسم بالإنجليزية">
                <input className="input" dir="ltr" value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
              </Field>
              <Field label="الشعار النصي" hint="يظهر في التطبيق بدل الشعار، مثل LAURA">
                <input
                  className="input"
                  dir="ltr"
                  maxLength={12}
                  value={f.logoText}
                  onChange={(e) => set('logoText', e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="هاتف المتجر" error={show(errors.phone)} hint="للتنسيق مع السائقين وخدمة العملاء">
                <PhoneInput value={f.phone} onChange={(v) => set('phone', v)} />
              </Field>
            </div>
          </section>

          <section className="card section-card">
            <h2>العنوان والتجهيز</h2>
            <div className="form-grid">
              <Field label="المدينة" hint="يغيّرها فريق ستايلو">
                <div className="readonly-value">{store.city}</div>
              </Field>
              <Field label="الحي / المنطقة">
                <input className="input" value={f.district} onChange={(e) => set('district', e.target.value)} />
              </Field>
              <Field label="العنوان التفصيلي" hint="الشارع وأقرب معلم — يستلم منه السائق" full>
                <input className="input" value={f.addressLine} onChange={(e) => set('addressLine', e.target.value)} />
              </Field>
              <Field
                label="وقت تجهيز الطلب"
                required
                error={show(errors.prepHours)}
                hint="يُستخدم لحساب «يصلك اليوم / غداً» للزبائن"
              >
                <IntInput value={f.prepHours} onChange={(v) => set('prepHours', v)} unit="ساعة" />
              </Field>
            </div>
          </section>

          <div className="row">
            <button className="btn btn-primary" onClick={submit} disabled={update.isPending}>
              حفظ الإعدادات
            </button>
            {update.isSuccess && <span className="alert alert-info">تم الحفظ ✓</span>}
          </div>
          <ErrorAlert error={update.error} />
        </div>

        <aside className="card section-card">
          <h2>يحددها فريق ستايلو</h2>
          <div className="section-sub">للتعديل تواصلي مع فريق ستايلو</div>
          <dl className="kv">
            <dt>حالة المتجر</dt>
            <dd>
              <Badge tone={STORE_STATUS[store.status].tone}>{STORE_STATUS[store.status].label}</Badge>
            </dd>
            <dt>رسوم التوصيل المباشر</dt>
            <dd>
              <Money value={store.deliveryFee} />
            </dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}
