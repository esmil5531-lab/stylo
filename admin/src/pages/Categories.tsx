import { useState } from 'react';

import { useCategories, useDeleteCategory, useReorderCategories, useSaveCategory } from '@/api/hooks';
import type { Category } from '@/api/types';
import { Count } from '@/components/inputs';
import { Async, Badge, Empty, ErrorAlert, Field, Icon, Modal, PageHead } from '@/components/ui';
import { CATEGORY_COLORS, CATEGORY_ICONS, iconPath, tileBackground, tileIconColor } from '@/lib/categoryIcons';

/**
 * «الأقسام»: main categories (نساء، رجال…) and their sub-categories (فساتين، عبايات…).
 * Order, show/hide, icon and colour of the tile the customer app draws, and where products are filed.
 */
export function CategoriesPage() {
  const categories = useCategories();
  const save = useSaveCategory();
  const reorder = useReorderCategories();
  const [editing, setEditing] = useState<{ category: Category | null; parentId: string | null } | null>(null);

  const move = (list: Category[], index: number, delta: number) => {
    const ids = list.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    reorder.mutate({ parentId: list[0]!.parentId, ids });
  };

  return (
    <div className="stack">
      <PageHead
        title="الأقسام"
        subtitle="أقسام رئيسية وأقسام فرعية تحتها، كما تظهر في تطبيق الزبائن. القسم المخفي لا يظهر للزبائن، ومنتجاته تبقى محفوظة."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing({ category: null, parentId: null })}>
            <Icon name="plus" />
            إضافة قسم رئيسي
          </button>
        }
      />
      <ErrorAlert error={save.error ?? reorder.error} />

      <Async query={categories}>
        {(items) => {
          const mains = items.filter((c) => !c.parentId);
          if (mains.length === 0) return <Empty title="لا توجد أقسام بعد" />;
          return (
            <div className="stack">
              {mains.map((main, i) => {
                const subs = items.filter((c) => c.parentId === main.id);
                return (
                  <section key={main.id} className="card">
                    <CategoryRow
                      category={main}
                      main
                      first={i === 0}
                      last={i === mains.length - 1}
                      busy={reorder.isPending || save.isPending}
                      onUp={() => move(mains, i, -1)}
                      onDown={() => move(mains, i, 1)}
                      onEdit={() => setEditing({ category: main, parentId: null })}
                      onToggle={() => save.mutate({ id: main.id, isActive: !main.isActive })}
                    />
                    <div className="cat-subs">
                      {subs.map((sub, j) => (
                        <CategoryRow
                          key={sub.id}
                          category={sub}
                          parentHidden={!main.isActive}
                          first={j === 0}
                          last={j === subs.length - 1}
                          busy={reorder.isPending || save.isPending}
                          onUp={() => move(subs, j, -1)}
                          onDown={() => move(subs, j, 1)}
                          onEdit={() => setEditing({ category: sub, parentId: main.id })}
                          onToggle={() => save.mutate({ id: sub.id, isActive: !sub.isActive })}
                        />
                      ))}
                      <button
                        className="btn btn-ghost btn-sm cat-add-sub"
                        onClick={() => setEditing({ category: null, parentId: main.id })}
                      >
                        <Icon name="plus" size={16} />
                        قسم فرعي في «{main.nameAr}»
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          );
        }}
      </Async>

      {editing && (
        <CategoryForm
          category={editing.category}
          parentId={editing.parentId}
          mains={(categories.data ?? []).filter((c) => !c.parentId)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Tile({ category, size = 44 }: { category: Pick<Category, 'icon' | 'color' | 'imageUrl'>; size?: number }) {
  const color = category.color ?? '#5B0E2D';
  if (category.imageUrl) {
    return <img className="cat-tile" src={category.imageUrl} alt="" style={{ width: size, height: size }} />;
  }
  return (
    <span className="cat-tile" style={{ width: size, height: size, background: tileBackground(color) }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55}>
        <path d={iconPath(category.icon)} fill={tileIconColor(color)} />
      </svg>
    </span>
  );
}

function CategoryRow({
  category: c,
  main,
  parentHidden,
  first,
  last,
  busy,
  onUp,
  onDown,
  onEdit,
  onToggle,
}: {
  category: Category;
  main?: boolean;
  parentHidden?: boolean;
  first: boolean;
  last: boolean;
  busy: boolean;
  onUp: () => void;
  onDown: () => void;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <div className={`cat-row${main ? ' cat-main' : ''}${c.isActive && !parentHidden ? '' : ' cat-hidden'}`}>
      <Tile category={c} size={main ? 48 : 36} />
      <div className="cat-name">
        <div className={main ? 'strong' : 'cell-title'}>{c.nameAr}</div>
        <div className="cell-sub" dir="ltr">
          {c.nameEn ? `${c.nameEn} · ` : ''}
          {c.slug}
        </div>
      </div>
      <div className="cat-meta small">
        <Count value={main ? c.totalProductCount : c.productCount} /> منتج
        {main && c.childrenCount > 0 && (
          <span className="muted">
            {' '}
            · <Count value={c.childrenCount} /> فرعي
          </span>
        )}
      </div>
      <div className="cat-status">
        {!c.isActive ? (
          <Badge tone="gray">مخفي</Badge>
        ) : parentHidden ? (
          <Badge tone="gray">مخفي مع القسم الرئيسي</Badge>
        ) : (
          <Badge tone="green">ظاهر</Badge>
        )}
      </div>
      <div className="cat-actions">
        <button className="btn btn-ghost btn-sm" disabled={first || busy} onClick={onUp} aria-label={`تقديم ${c.nameAr}`}>
          ▲
        </button>
        <button className="btn btn-ghost btn-sm" disabled={last || busy} onClick={onDown} aria-label={`تأخير ${c.nameAr}`}>
          ▼
        </button>
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={onToggle}>
          {c.isActive ? 'إخفاء' : 'إظهار'}
        </button>
        <button className="btn btn-outline btn-sm" onClick={onEdit}>
          تعديل
        </button>
      </div>
    </div>
  );
}

function CategoryForm({
  category,
  parentId,
  mains,
  onClose,
}: {
  category: Category | null;
  parentId: string | null;
  mains: Category[];
  onClose: () => void;
}) {
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [f, setF] = useState({
    nameAr: category?.nameAr ?? '',
    nameEn: category?.nameEn ?? '',
    slug: category?.slug ?? '',
    parentId: category?.parentId ?? parentId ?? '',
    icon: category?.icon ?? 'hanger',
    color: category?.color ?? '#5B0E2D',
    imageUrl: category?.imageUrl ?? '',
    isActive: category?.isActive ?? true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const hasChildren = (category?.childrenCount ?? 0) > 0;
  const errors = {
    nameAr: f.nameAr.trim().length < 2 ? 'اكتبي اسم القسم' : null,
    slug: f.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug) ? 'حروف لاتينية صغيرة وأرقام وشرطات فقط، مثل women-dresses' : null,
    color: !/^#[0-9A-Fa-f]{6}$/.test(f.color) ? 'لون بصيغة #RRGGBB' : null,
    imageUrl: f.imageUrl && !/^https?:\/\/\S+$/.test(f.imageUrl) ? 'رابط يبدأ بـ https://' : null,
  };
  const show = (e: string | null) => (submitted ? e : null);

  const submit = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    save.mutate(
      {
        id: category?.id,
        nameAr: f.nameAr.trim(),
        nameEn: f.nameEn.trim() || null,
        ...(f.slug.trim() ? { slug: f.slug.trim() } : {}),
        parentId: f.parentId || null,
        icon: f.icon,
        color: f.color,
        imageUrl: f.imageUrl.trim() || null,
        isActive: f.isActive,
      },
      { onSuccess: onClose },
    );
  };

  const canDelete = category && category.childrenCount === 0 && category.productCount === 0;

  return (
    <Modal
      title={category ? `تعديل «${category.nameAr}»` : f.parentId ? 'قسم فرعي جديد' : 'قسم رئيسي جديد'}
      onClose={onClose}
      footer={
        <>
          {category && (
            <button
              className="btn btn-ghost"
              style={{ marginInlineEnd: 'auto', color: 'var(--red)' }}
              disabled={!canDelete || remove.isPending}
              title={canDelete ? undefined : 'لا يُحذف قسم فيه منتجات أو أقسام فرعية — أخفيه بدلاً من ذلك'}
              onClick={() => (confirmDelete ? remove.mutate(category.id, { onSuccess: onClose }) : setConfirmDelete(true))}
            >
              {confirmDelete ? 'تأكيد الحذف' : 'حذف القسم'}
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
      <div className="cat-preview">
        <Tile category={{ icon: f.icon, color: /^#[0-9A-Fa-f]{6}$/.test(f.color) ? f.color : '#5B0E2D', imageUrl: f.imageUrl || null }} size={72} />
        <div>
          <div className="strong">{f.nameAr || 'اسم القسم'}</div>
          <div className="muted small">هكذا يظهر المربع في تطبيق الزبائن</div>
        </div>
      </div>

      <div className="form-grid">
        <Field label="الاسم بالعربية" required error={show(errors.nameAr)}>
          <input className="input" value={f.nameAr} maxLength={40} onChange={(e) => set('nameAr', e.target.value)} autoFocus />
        </Field>
        <Field label="الاسم بالإنجليزية" hint="اختياري — يُكوَّن منه الرابط المختصر">
          <input className="input" dir="ltr" value={f.nameEn} maxLength={40} onChange={(e) => set('nameEn', e.target.value)} />
        </Field>
        <Field label="يتبع" hint={hasChildren ? 'له أقسام فرعية، فيبقى رئيسياً' : 'الأقسام مستويان: رئيسي وفرعي'}>
          <select className="select" value={f.parentId} disabled={hasChildren} onChange={(e) => set('parentId', e.target.value)}>
            <option value="">قسم رئيسي</option>
            {mains
              .filter((m) => m.id !== category?.id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  فرعي في «{m.nameAr}»
                </option>
              ))}
          </select>
        </Field>
        <Field label="الرابط المختصر (slug)" error={show(errors.slug)} hint="اتركيه فارغاً ليُكوَّن تلقائياً">
          <input className="input" dir="ltr" value={f.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} placeholder="women-dresses" />
        </Field>

        <div className="form-section">شكل المربع</div>
        <Field label="الأيقونة" full group>
          <div className="icon-grid" role="radiogroup" aria-label="الأيقونة">
            {CATEGORY_ICONS.map((i) => (
              <button
                key={i.name}
                type="button"
                role="radio"
                aria-checked={f.icon === i.name}
                className={`icon-choice${f.icon === i.name ? ' active' : ''}`}
                title={i.label}
                onClick={() => set('icon', i.name)}
              >
                <svg viewBox="0 0 24 24" width={22} height={22}>
                  <path d={i.path} fill="currentColor" />
                </svg>
                <span>{i.label}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="اللون" group error={show(errors.color)}>
          <div className="swatches">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${f.color.toLowerCase() === c.toLowerCase() ? ' active' : ''}`}
                style={{ background: c }}
                aria-label={c}
                onClick={() => set('color', c)}
              />
            ))}
            <input className="input swatch-input" dir="ltr" value={f.color} maxLength={7} onChange={(e) => set('color', e.target.value)} />
          </div>
        </Field>
        <Field label="صورة بدل الأيقونة" error={show(errors.imageUrl)} hint="اختياري — رابط صورة مربعة">
          <input className="input" dir="ltr" value={f.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://…" />
        </Field>

        <label className="check full">
          <input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          ظاهر للزبائن
        </label>
      </div>
      {category && !canDelete && (
        <div className="muted small">
          لا يُحذف قسم فيه منتجات أو أقسام فرعية. أخفيه بدلاً من ذلك، أو انقلي منتجاته لقسم آخر من صفحة المنتج.
        </div>
      )}
      <ErrorAlert error={save.error ?? remove.error} />
    </Modal>
  );
}
