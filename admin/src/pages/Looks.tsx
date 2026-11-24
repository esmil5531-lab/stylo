import { useState } from 'react';

import { useAdminLook, useAdminLooks, useDeleteLook, useMe, useProducts, useSaveLook, useStores } from '@/api/hooks';
import type { AdminLook, AdminProduct } from '@/api/types';
import { Count, Money } from '@/components/inputs';
import { useCan } from '@/components/Layout';
import { Async, Badge, Empty, ErrorAlert, Field, Icon, Modal, PageHead } from '@/components/ui';

const MIN_ITEMS = 2;
const MAX_ITEMS = 8;

/**
 * «كمّل اللوك»: outfits of 2–8 pieces from ONE store, added to the cart in one tap.
 * Store staff manage their own store's looks; Stylo staff choose the look featured on the home screen.
 */
export function LooksPage() {
  const me = useMe().data;
  const platform = !me?.store;
  const [storeId, setStoreId] = useState('');
  const canReadStores = useCan('stores.read');
  const stores = useStores({}, platform && canReadStores);
  const looks = useAdminLooks(storeId ? { storeId } : {});
  const save = useSaveLook();
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  return (
    <div className="stack">
      <PageHead
        title="كمّل اللوك"
        subtitle={
          platform
            ? 'إطلالات كاملة من متجر واحد تُضاف للسلة بضغطة. اللوك «المميز» يظهر في الصفحة الرئيسية.'
            : `إطلالات كاملة من «${me?.store?.name}» تظهر في التطبيق وتُضاف للسلة بضغطة.`
        }
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" />
            لوك جديد
          </button>
        }
      />
      {platform && (
        <div className="row">
          <label className="field" style={{ minWidth: 220 }}>
            <span className="field-label">المتجر</span>
            <select className="select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">كل المتاجر</option>
              {stores.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <ErrorAlert error={save.error} />

      <Async query={looks}>
        {(items) =>
          items.length === 0 ? (
            <Empty title="لا توجد لوكات بعد" hint="اختاري قطعتين أو أكثر من نفس المتجر لتكوين إطلالة كاملة" />
          ) : (
            <section className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>اللوك</th>
                      {platform && <th>المتجر</th>}
                      <th>القطع</th>
                      <th>سعر اللوك</th>
                      <th>الحالة</th>
                      {platform && <th>الرئيسية</th>}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((l) => (
                      <LookRow
                        key={l.id}
                        look={l}
                        platform={platform}
                        busy={save.isPending}
                        onEdit={() => setEditing(l.id)}
                        onFeature={() => save.mutate({ id: l.id, isFeatured: !l.isFeatured })}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        }
      </Async>
      {editing && (
        <LookForm
          lookId={editing === 'new' ? null : editing}
          platform={platform}
          defaultStoreId={me?.store?.id ?? storeId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LookRow({
  look: l,
  platform,
  busy,
  onEdit,
  onFeature,
}: {
  look: AdminLook;
  platform: boolean;
  busy: boolean;
  onEdit: () => void;
  onFeature: () => void;
}) {
  return (
    <tr>
      <td>
        <div className="cell-title">{l.title}</div>
        {l.subtitle && <div className="cell-sub">{l.subtitle}</div>}
      </td>
      {platform && <td>{l.store.name}</td>}
      <td>
        <Count value={l.visibleItems} />
        {l.visibleItems !== l.itemsCount && (
          <span className="muted small">
            {' '}
            من <Count value={l.itemsCount} />
          </span>
        )}
      </td>
      <td className="strong">
        <Money value={l.totalPrice} />
      </td>
      <td>
        {l.visibleToCustomers ? <Badge tone="green">ظاهر للزبائن</Badge> : <Badge tone="gray">{l.hiddenReason ?? 'مخفي'}</Badge>}
      </td>
      {platform && (
        <td>
          <button className={`btn btn-sm ${l.isFeatured ? 'btn-primary' : 'btn-outline'}`} disabled={busy} onClick={onFeature}>
            {l.isFeatured ? '★ مميز' : 'تمييز'}
          </button>
        </td>
      )}
      <td>
        <button className="btn btn-outline btn-sm" onClick={onEdit}>
          تعديل
        </button>
      </td>
    </tr>
  );
}

function LookForm({
  lookId,
  platform,
  defaultStoreId,
  onClose,
}: {
  lookId: string | null;
  platform: boolean;
  defaultStoreId: string;
  onClose: () => void;
}) {
  const existing = useAdminLook(lookId);
  if (lookId && !existing.data) {
    return (
      <Modal title="تعديل اللوك" onClose={onClose} footer={null}>
        <Async query={existing}>{() => null}</Async>
      </Modal>
    );
  }
  const d = existing.data;
  return (
    <LookFormBody
      key={d?.id ?? 'new'}
      lookId={lookId}
      platform={platform}
      initial={{
        storeId: d?.store.id ?? defaultStoreId,
        title: d?.title ?? '',
        subtitle: d?.subtitle ?? '',
        coverUrl: d?.coverUrl ?? '',
        isActive: d?.isActive ?? true,
        isFeatured: d?.isFeatured ?? false,
        items: d?.items.map((i) => ({ id: i.id, name: i.name, price: i.price, status: i.status })) ?? [],
      }}
      onClose={onClose}
    />
  );
}

type Piece = { id: string; name: string; price: number; status: string };

function LookFormBody({
  lookId,
  platform,
  initial,
  onClose,
}: {
  lookId: string | null;
  platform: boolean;
  initial: { storeId: string; title: string; subtitle: string; coverUrl: string; isActive: boolean; isFeatured: boolean; items: Piece[] };
  onClose: () => void;
}) {
  const save = useSaveLook();
  const remove = useDeleteLook();
  const stores = useStores({}, platform && !lookId);
  const [f, setF] = useState(initial);
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const products = useProducts({ storeId: f.storeId || undefined, status: 'active', q: q || undefined });

  const add = (p: AdminProduct) =>
    f.items.length < MAX_ITEMS &&
    !f.items.some((i) => i.id === p.id) &&
    set('items', [...f.items, { id: p.id, name: p.nameAr, price: p.basePrice, status: p.status }]);
  const removeItem = (id: string) => set('items', f.items.filter((i) => i.id !== id));
  const move = (i: number, d: number) => {
    const items = [...f.items];
    const [m] = items.splice(i, 1);
    items.splice(i + d, 0, m!);
    set('items', items);
  };

  const total = f.items.filter((i) => i.status === 'active').reduce((s, i) => s + i.price, 0);
  const errors = {
    storeId: !f.storeId ? 'اختاري المتجر' : null,
    title: f.title.trim().length < 2 ? 'اكتبي اسم اللوك' : null,
    items: f.items.length < MIN_ITEMS ? `اختاري ${MIN_ITEMS} قطع على الأقل من المتجر` : null,
    coverUrl: f.coverUrl && !/^https?:\/\/\S+$/.test(f.coverUrl) ? 'رابط يبدأ بـ https://' : null,
  };
  const show = (e: string | null) => (submitted ? e : null);

  const submit = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    save.mutate(
      {
        id: lookId ?? undefined,
        ...(lookId ? {} : { storeId: f.storeId }),
        title: f.title.trim(),
        subtitle: f.subtitle.trim() || null,
        coverUrl: f.coverUrl.trim() || null,
        isActive: f.isActive,
        ...(platform ? { isFeatured: f.isFeatured } : {}),
        productIds: f.items.map((i) => i.id),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      title={lookId ? `تعديل «${initial.title}»` : 'لوك جديد'}
      onClose={onClose}
      footer={
        <>
          {lookId && (
            <button
              className="btn btn-ghost"
              style={{ marginInlineEnd: 'auto', color: 'var(--red)' }}
              disabled={remove.isPending}
              onClick={() => (confirmDelete ? remove.mutate(lookId, { onSuccess: onClose }) : setConfirmDelete(true))}
            >
              {confirmDelete ? 'تأكيد الحذف' : 'حذف اللوك'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>
            حفظ
          </button>
        </>
      }
    >
      <div className="form-grid">
        {platform && !lookId && (
          <Field label="المتجر" required error={show(errors.storeId)} hint="كل قطع اللوك من هذا المتجر">
            <select
              className="select"
              value={f.storeId}
              onChange={(e) => setF((s) => ({ ...s, storeId: e.target.value, items: [] }))}
            >
              <option value="">اختاري…</option>
              {stores.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="اسم اللوك" required error={show(errors.title)} full={!platform || !!lookId}>
          <input className="input" value={f.title} maxLength={60} onChange={(e) => set('title', e.target.value)} placeholder="مثل: إطلالة مسائية بالعنابي" autoFocus />
        </Field>
        <Field label="وصف قصير" hint="مثل: فستان، حقيبة، نظارة وساعة">
          <input className="input" value={f.subtitle} maxLength={90} onChange={(e) => set('subtitle', e.target.value)} />
        </Field>
        <Field label="صورة الغلاف" error={show(errors.coverUrl)} hint="اختياري">
          <input className="input" dir="ltr" value={f.coverUrl} onChange={(e) => set('coverUrl', e.target.value)} placeholder="https://…" />
        </Field>

        <div className="form-section">
          قطع اللوك ({f.items.length} من {MAX_ITEMS}) — سعر اللوك <Money value={total} />
        </div>
        <div className="full">
          {f.items.length === 0 ? (
            <div className={`muted small${show(errors.items) ? ' field-error' : ''}`}>{show(errors.items) ?? 'اختاري القطع من القائمة أدناه.'}</div>
          ) : (
            <ol className="look-pieces">
              {f.items.map((p, i) => (
                <li key={p.id}>
                  <span className="cell-title">{p.name}</span>
                  {p.status !== 'active' && <Badge tone="gray">غير معروض</Badge>}
                  <span className="spacer" />
                  <Money value={p.price} />
                  <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`تقديم ${p.name}`}>
                    ▲
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={i === f.items.length - 1} onClick={() => move(i, 1)} aria-label={`تأخير ${p.name}`}>
                    ▼
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeItem(p.id)} aria-label={`إزالة ${p.name}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          )}
          {submitted && errors.items && f.items.length > 0 && <div className="field-error">{errors.items}</div>}
        </div>

        {f.storeId && (
          <div className="full stack" style={{ gap: 6 }}>
            <input className="input" placeholder="ابحثي في منتجات المتجر…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="look-picker">
              {products.data
                ?.filter((p) => !f.items.some((i) => i.id === p.id))
                .map((p) => (
                  <button key={p.id} type="button" className="look-pick" disabled={f.items.length >= MAX_ITEMS} onClick={() => add(p)}>
                    <span className="swatch-dot" style={{ background: p.colorHex ?? '#C9A9A6' }} />
                    <span className="look-pick-name">{p.nameAr}</span>
                    <Money value={p.basePrice} />
                    <Icon name="plus" size={14} />
                  </button>
                ))}
              {products.data?.length === 0 && <div className="muted small">لا توجد منتجات معروضة في هذا المتجر.</div>}
            </div>
          </div>
        )}

        <label className="check">
          <input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          ظاهر في التطبيق
        </label>
        {platform && (
          <label className="check">
            <input type="checkbox" checked={f.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} />
            مميز في الصفحة الرئيسية
          </label>
        )}
      </div>
      <ErrorAlert error={save.error ?? remove.error} />
    </Modal>
  );
}
