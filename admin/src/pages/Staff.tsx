import { useState } from 'react';

import { useCreateStaff, useMe, useRoles, useStaff, useStores, useUpdateStaff } from '@/api/hooks';
import type { Role, StaffMember } from '@/api/types';
import { Can, useCan } from '@/components/Layout';
import { Phone, PhoneInput } from '@/components/inputs';
import { Async, Badge, ErrorAlert, Field, Icon, Modal, PageHead } from '@/components/ui';
import { normaliseLibyanPhone } from '@/lib/numbers';

export function StaffPage() {
  const staff = useStaff();
  const roles = useRoles();
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null);
  const canWrite = useCan('staff.write');
  const me = useMe().data;

  return (
    <div className="stack">
      <PageHead
        title="الموظفون والصلاحيات"
        subtitle="موظفو ستايلو وموظفو المتاجر، وما يستطيع كل دور فعله"
        actions={
          <Can permission="staff.write">
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              <Icon name="plus" />
              إضافة موظف
            </button>
          </Can>
        }
      />

      <section className="card">
        <Async query={staff}>
          {(items) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>الهاتف</th>
                    <th>الدور</th>
                    <th>نطاق العمل</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr
                      key={s.id}
                      className={`${!s.isActive ? 'inactive ' : ''}${canWrite && s.id !== me?.id ? 'clickable' : ''}`}
                      onClick={() => canWrite && s.id !== me?.id && setEditing(s)}
                    >
                      <td>
                        <div className="cell-title">
                          {s.fullName} {s.id === me?.id && <span className="cell-sub">(أنت)</span>}
                        </div>
                        <div className="cell-sub">{s.jobTitle}</div>
                      </td>
                      <td>
                        <Phone value={s.phone} />
                      </td>
                      <td>
                        <Badge tone="brand">{s.role.name}</Badge>
                      </td>
                      <td>{s.store ? `متجر «${s.store.name}»` : 'كل المنصة'}</td>
                      <td>
                        <Badge tone={s.isActive ? 'green' : 'gray'}>{s.isActive ? 'فعّال' : 'معطّل'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </section>

      <section className="card card-pad">
        <div className="card-title">الأدوار وصلاحياتها</div>
        <Async query={roles}>
          {(list) => (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {list.map((r) => (
                    <tr key={r.key}>
                      <td style={{ width: 200 }}>
                        <div className="cell-title">{r.name}</div>
                        <div className="cell-sub">{r.storeScoped ? 'مرتبط بمتجر واحد' : 'على مستوى المنصة'}</div>
                      </td>
                      <td>
                        {r.permissions.map((p) => (
                          <span key={p.key} className="chip">
                            {p.label}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </section>

      {editing && roles.data && (
        <StaffForm member={editing === 'new' ? null : editing} roles={roles.data} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function StaffForm({ member, roles, onClose }: { member: StaffMember | null; roles: Role[]; onClose: () => void }) {
  const create = useCreateStaff();
  const update = useUpdateStaff();
  const mutation = member ? update : create;
  const stores = useStores();

  const [f, setF] = useState({
    fullName: member?.fullName ?? '',
    phone: member?.phone ?? '',
    email: member?.email ?? '',
    jobTitle: member?.jobTitle ?? '',
    roleKey: member?.role.key ?? roles.find((r) => r.key === 'customer_support')?.key ?? roles[0]!.key,
    storeId: member?.store?.id ?? '',
    isActive: member?.isActive ?? true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const role = roles.find((r) => r.key === f.roleKey);
  const [submitted, setSubmitted] = useState(false);
  const phone = normaliseLibyanPhone(f.phone);
  const errors = {
    fullName: !member && f.fullName.trim().length < 2 ? 'اكتبي الاسم الكامل' : null,
    phone: !member && !phone ? 'رقم ليبي غير صحيح، مثال: 0912345678' : null,
    email: !member && f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email) ? 'بريد غير صحيح' : null,
    store: role?.storeScoped && !f.storeId ? 'اختاري المتجر لهذا الدور' : null,
  };
  const show = (e: string | null) => (submitted ? e : null);

  const submit = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    const storeId = role?.storeScoped ? f.storeId : null;
    if (member) {
      update.mutate(
        { id: member.id, roleKey: f.roleKey, storeId, jobTitle: f.jobTitle, isActive: f.isActive },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(
        {
          fullName: f.fullName,
          phone: phone!,
          email: f.email || undefined,
          jobTitle: f.jobTitle || undefined,
          roleKey: f.roleKey,
          storeId,
        },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <Modal
      title={member ? `تعديل «${member.fullName}»` : 'إضافة موظف'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button className="btn btn-primary" disabled={mutation.isPending} onClick={submit}>
            {member ? 'حفظ' : 'إضافة الموظف'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {!member && (
          <>
            <Field label="الاسم الكامل" required error={show(errors.fullName)}>
              <input className="input" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} autoFocus />
            </Field>
            <Field label="رقم الهاتف" required error={show(errors.phone)} hint="يُستخدم لتسجيل الدخول لاحقاً">
              <PhoneInput value={f.phone} onChange={(v) => set('phone', v)} />
            </Field>
            <Field label="البريد الإلكتروني" error={show(errors.email)}>
              <input className="input" dir="ltr" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
          </>
        )}
        <Field label="المسمى الوظيفي">
          <input className="input" value={f.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} />
        </Field>
        <Field label="الدور" full>
          <select className="select" value={f.roleKey} onChange={(e) => set('roleKey', e.target.value)}>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name} — {r.description}
              </option>
            ))}
          </select>
        </Field>
        {role?.storeScoped && (
          <Field label="المتجر" required error={show(errors.store)} hint="موظف المتجر يرى بيانات هذا المتجر فقط" full>
            <select className="select" value={f.storeId} onChange={(e) => set('storeId', e.target.value)}>
              <option value="">اختاري المتجر…</option>
              {stores.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr} — {s.city}
                </option>
              ))}
            </select>
          </Field>
        )}
        {role && (
          <div className="full">
            <div className="field-label">صلاحيات هذا الدور</div>
            {role.permissions.map((p) => (
              <span key={p.key} className="chip">
                {p.label}
              </span>
            ))}
          </div>
        )}
        {member && (
          <label className="check full">
            <input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            الحساب فعّال (إلغاء التحديد يمنع الدخول إلى اللوحة)
          </label>
        )}
      </div>
      <ErrorAlert error={mutation.error} />
    </Modal>
  );
}
