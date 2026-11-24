import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useCategories, useMe, useProduct, useSaveProduct, useStores, type VariantInput } from '@/api/hooks';
import type { AdminProductDetail, ProductStatus } from '@/api/types';
import { IntInput, MoneyInput, Num } from '@/components/inputs';
import { useCan } from '@/components/Layout';
import { Async, Badge, ErrorAlert, Field, PageHead } from '@/components/ui';
import { dirhamsToInput, formatLYD, parseLYD } from '@/lib/format';
import { parseIntInput } from '@/lib/numbers';
import { COLOR_PRESETS, PRODUCT_STATUS, SIZE_PRESETS } from '@/lib/sizes';

interface Color {
  name: string;
  hex: string;
}
interface Cell {
  id?: string;
  sku?: string;
  stock: string;
  price: string;
}

const cellKey = (size: string | null, color: string | null) => `${size ?? ''}|${color ?? ''}`;
const MAX_STOCK = 100_000;

export function ProductFormPage() {
  const { id } = useParams();
  const product = useProduct(id);
  if (!id) return <ProductEditor />;
  return <Async query={product}>{(p) => <ProductEditor key={p.id} initial={p} />}</Async>;
}

function ProductEditor({ initial }: { initial?: AdminProductDetail }) {
  const me = useMe().data;
  const categories = useCategories();
  const stores = useStores();
  const canWrite = useCan('products.write');
  const save = useSaveProduct(initial?.id);
  const navigate = useNavigate();
  const platform = !me?.store;

  // ------------------------------------------------------------ state (seeded from the product)
  const [info, setInfo] = useState({
    storeId: initial?.store.id ?? '',
    nameAr: initial?.nameAr ?? '',
    nameEn: initial?.nameEn ?? '',
    brand: initial?.brand ?? '',
    categoryId: initial?.category?.id ?? '',
    descriptionAr: initial?.descriptionAr ?? '',
    status: initial?.status ?? ('draft' as ProductStatus),
    isFeatured: initial?.isFeatured ?? false,
  });
  const set = <K extends keyof typeof info>(k: K, v: (typeof info)[K]) => setInfo((p) => ({ ...p, [k]: v }));
  const [price, setPrice] = useState(initial ? dirhamsToInput(initial.basePrice) : '');
  const [compare, setCompare] = useState(initial?.compareAtPrice ? dirhamsToInput(initial.compareAtPrice) : '');

  const [sizes, setSizes] = useState<string[]>(() =>
    unique((initial?.variants ?? []).map((v) => v.size).filter((s): s is string => !!s)),
  );
  const [colors, setColors] = useState<Color[]>(() => {
    const seen = new Map<string, Color>();
    for (const v of initial?.variants ?? []) {
      if (v.colorName && !seen.has(v.colorName)) seen.set(v.colorName, { name: v.colorName, hex: v.colorHex ?? '#CCCCCC' });
    }
    return [...seen.values()];
  });
  const [cells, setCells] = useState<Record<string, Cell>>(() =>
    Object.fromEntries(
      (initial?.variants ?? []).map((v) => [
        cellKey(v.size, v.colorName),
        { id: v.id, sku: v.sku, stock: String(v.stock), price: v.price ? dirhamsToInput(v.price) : '' },
      ]),
    ),
  );
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);

  const soldBy = useMemo(
    () => new Map((initial?.variants ?? []).map((v) => [cellKey(v.size, v.colorName), v.sold])),
    [initial],
  );

  // One row per size × colour (or a single row when the product has neither).
  const matrix = (sizes.length ? sizes : [null]).flatMap((size) =>
    (colors.length ? colors : [null]).map((color) => ({ size, color, key: cellKey(size, color?.name ?? null) })),
  );
  const cellOf = (key: string): Cell => cells[key] ?? { stock: '', price: '' };
  const setCell = (key: string, patch: Partial<Cell>) => setCells((c) => ({ ...c, [key]: { ...cellOf(key), ...patch } }));

  // ------------------------------------------------------------ validation (shown after the first save attempt)
  const basePrice = parseLYD(price);
  const compareAt = compare.trim() ? parseLYD(compare) : null;
  const errors = {
    store: platform && !initial && !info.storeId ? 'اختاري المتجر' : null,
    nameAr: info.nameAr.trim().length < 2 ? 'اكتبي اسم المنتج بالعربية' : null,
    price: !basePrice ? 'أدخلي سعراً صحيحاً، مثل 199 أو 12.5' : null,
    compare:
      compare.trim() && compareAt === null
        ? 'رقم غير صحيح'
        : compareAt !== null && basePrice && compareAt <= basePrice
          ? 'يجب أن يكون أعلى من سعر البيع ليظهر كخصم'
          : null,
    images: images.some((u) => u.trim() && !/^https?:\/\/\S+$/.test(u.trim())) ? 'روابط الصور تبدأ بـ https://' : null,
  };
  const cellErrors = Object.fromEntries(
    matrix.map(({ key }) => {
      const c = cellOf(key);
      const stockOk = parseIntInput(c.stock, 0, MAX_STOCK) !== null;
      const priceOk = !c.price.trim() || !!parseLYD(c.price);
      return [key, !stockOk ? 'الكمية' : !priceOk ? 'السعر' : null];
    }),
  );
  const hasErrors = Object.values(errors).some(Boolean) || Object.values(cellErrors).some(Boolean);
  const show = (e: string | null) => (submitted ? e : null);

  const totalStock = matrix.reduce((s, { key }) => s + (parseIntInput(cellOf(key).stock, 0, MAX_STOCK) ?? 0), 0);
  const discount = basePrice && compareAt && compareAt > basePrice ? Math.round((1 - basePrice / compareAt) * 100) : null;

  const submit = () => {
    setSubmitted(true);
    setSaved(false);
    if (hasErrors || !basePrice) return;
    const variants: VariantInput[] = matrix.map(({ size, color, key }) => {
      const c = cellOf(key);
      return {
        id: c.id,
        sku: c.sku ?? null,
        size,
        colorName: color?.name ?? null,
        colorHex: color?.hex ?? null,
        stock: parseIntInput(c.stock, 0, MAX_STOCK)!,
        price: c.price.trim() ? parseLYD(c.price) : null,
      };
    });
    save.mutate(
      {
        storeId: platform ? info.storeId || undefined : undefined,
        categoryId: info.categoryId || null,
        nameAr: info.nameAr,
        nameEn: info.nameEn || null,
        brand: info.brand || null,
        descriptionAr: info.descriptionAr || null,
        basePrice,
        compareAtPrice: compareAt,
        status: info.status,
        isFeatured: platform ? info.isFeatured : undefined,
        images: images.map((u) => u.trim()).filter(Boolean),
        variants,
      },
      {
        onSuccess: (p) => {
          setSaved(true);
          setSubmitted(false);
          if (!initial) navigate(`/products/${p.id}`, { replace: true });
        },
      },
    );
  };

  return (
    <div className="stack">
      <PageHead
        crumb={<Link to="/products">المنتجات</Link>}
        title={initial ? initial.nameAr : 'إضافة منتج'}
        subtitle={initial ? `${initial.store.name} · ${PRODUCT_STATUS[initial.status].label}` : 'الحقول المعلّمة بـ * إلزامية'}
      />

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          {/* ---------------------------------------------------- basics */}
          <section className="card section-card">
            <h2>المعلومات الأساسية</h2>
            <div className="form-grid">
              {platform && !initial && (
                <Field label="المتجر" required error={show(errors.store)} full>
                  <select className="select" value={info.storeId} onChange={(e) => set('storeId', e.target.value)}>
                    <option value="">اختاري المتجر…</option>
                    {stores.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nameAr} — {s.city}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="اسم المنتج بالعربية" required error={show(errors.nameAr)}>
                <input className="input" value={info.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
              </Field>
              <Field label="الاسم بالإنجليزية" hint="اختياري — للبحث وروابط المنتج">
                <input className="input" dir="ltr" value={info.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
              </Field>
              <Field label="القسم">
                <select className="select" value={info.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">بدون قسم</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="الماركة">
                <input className="input" value={info.brand} onChange={(e) => set('brand', e.target.value)} />
              </Field>
              <Field label="الوصف" hint="الخامة، القصّة، تعليمات العناية…" full>
                <textarea
                  className="textarea"
                  rows={3}
                  value={info.descriptionAr}
                  onChange={(e) => set('descriptionAr', e.target.value)}
                />
              </Field>
            </div>
          </section>

          {/* ---------------------------------------------------- price */}
          <section className="card section-card">
            <h2>السعر</h2>
            <div className="form-grid">
              <Field label="سعر البيع" required error={show(errors.price)} hint={basePrice ? formatLYD(basePrice) : undefined}>
                <MoneyInput value={price} onChange={setPrice} />
              </Field>
              <Field
                label="السعر قبل الخصم"
                error={show(errors.compare)}
                hint={discount ? `يظهر في «عروض» بخصم ${discount}%` : 'اتركيه فارغاً إن لم يكن هناك خصم'}
              >
                <MoneyInput value={compare} onChange={setCompare} />
              </Field>
            </div>
          </section>

          {/* ---------------------------------------------------- sizes & colours */}
          <section className="card section-card">
            <h2>المقاسات والألوان</h2>
            <div className="section-sub">اختاري نظام المقاسات ثم المقاسات المتوفرة، وأضيفي الألوان إن وُجدت</div>
            <SizePicker sizes={sizes} onChange={setSizes} />
            <ColorPicker colors={colors} onChange={setColors} />
          </section>

          {/* ---------------------------------------------------- stock matrix */}
          <section className="card">
            <div className="section-card" style={{ paddingBottom: 8 }}>
              <h2>الكميات لكل مقاس</h2>
              <BulkFill onApply={(v) => matrix.forEach(({ key }) => setCell(key, { stock: v }))} />
            </div>
            <div className="table-wrap">
              <table className="table matrix">
                <thead>
                  <tr>
                    <th>المقاس</th>
                    <th>اللون</th>
                    <th>الكمية *</th>
                    <th>سعر خاص (اختياري)</th>
                    <th>رمز SKU</th>
                    {initial && <th>بيع منه</th>}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map(({ size, color, key }) => {
                    const c = cellOf(key);
                    const err = submitted ? cellErrors[key] : null;
                    return (
                      <tr key={key}>
                        <td className="size-cell">{size ?? <span className="muted">مقاس واحد</span>}</td>
                        <td>
                          {color ? (
                            <span className="color-row">
                              <span className="swatch" style={{ background: color.hex }} />
                              {color.name}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className={err === 'الكمية' ? 'field has-error' : undefined}>
                          <IntInput
                            value={c.stock}
                            onChange={(v) => setCell(key, { stock: v })}
                            unit="قطعة"
                            aria-label={`الكمية ${size ?? ''} ${color?.name ?? ''}`}
                          />
                        </td>
                        <td className={err === 'السعر' ? 'field has-error' : undefined}>
                          <MoneyInput
                            value={c.price}
                            onChange={(v) => setCell(key, { price: v })}
                            placeholder={price || '0'}
                            aria-label="سعر خاص"
                          />
                        </td>
                        <td>
                          {c.sku ? <Num>{c.sku}</Num> : <span className="muted small">يُنشأ تلقائياً</span>}
                        </td>
                        {initial && (
                          <td>
                            <Num>{soldBy.get(key) ?? 0}</Num>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {submitted && Object.values(cellErrors).some(Boolean) && (
              <div className="card-pad">
                <div className="alert alert-error">أكملي الكمية لكل مقاس (0 أو أكثر)، والسعر الخاص يجب أن يكون رقماً صحيحاً.</div>
              </div>
            )}
          </section>

          {/* ---------------------------------------------------- images */}
          <section className="card section-card">
            <h2>الصور</h2>
            <div className="section-sub">روابط صور المنتج (رفع الصور مباشرة قادم لاحقاً). الصورة الأولى هي الرئيسية.</div>
            {images.map((url, i) => (
              <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
                <span className="thumb" style={{ background: 'var(--surface-2)' }}>
                  {/^https?:\/\//.test(url) && <img src={url} alt="" />}
                </span>
                <input
                  className="input"
                  dir="ltr"
                  placeholder="https://…"
                  value={url}
                  onChange={(e) => setImages((list) => list.map((u, j) => (j === i ? e.target.value : u)))}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => setImages((l) => l.filter((_, j) => j !== i))}>
                  حذف
                </button>
              </div>
            ))}
            {show(errors.images) && <div className="field-error">{errors.images}</div>}
            {images.length < 8 && (
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setImages((l) => [...l, ''])}>
                + إضافة رابط صورة
              </button>
            )}
          </section>
        </div>

        {/* ---------------------------------------------------- side summary */}
        <aside className="stack" style={{ position: 'sticky', top: 80 }}>
          <section className="card section-card">
            <h2>الحالة والنشر</h2>
            <Field label="الحالة" hint={PRODUCT_STATUS[info.status].hint}>
              <select className="select" value={info.status} onChange={(e) => set('status', e.target.value as ProductStatus)}>
                {(Object.keys(PRODUCT_STATUS) as ProductStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {PRODUCT_STATUS[s].label}
                  </option>
                ))}
              </select>
            </Field>
            {platform && (
              <label className="check">
                <input type="checkbox" checked={info.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} />
                منتج مميز في «لأجلك»
              </label>
            )}
          </section>
          <section className="card section-card">
            <h2>ملخص</h2>
            <dl className="kv">
              <dt>السعر</dt>
              <dd>{basePrice ? formatLYD(basePrice) : '—'}</dd>
              <dt>الخصم</dt>
              <dd>{discount ? <Badge tone="red">-{discount}%</Badge> : '—'}</dd>
              <dt>المقاسات</dt>
              <dd>{sizes.length ? <Num>{sizes.join(' · ')}</Num> : 'مقاس واحد'}</dd>
              <dt>الألوان</dt>
              <dd>{colors.length ? colors.map((c) => c.name).join('، ') : '—'}</dd>
              <dt>إجمالي الكمية</dt>
              <dd>
                <Num>{totalStock}</Num> قطعة
              </dd>
            </dl>
          </section>
          {canWrite && (
            <div className="stack" style={{ gap: 8 }}>
              <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>
                {initial ? 'حفظ التعديلات' : 'إضافة المنتج'}
              </button>
              {saved && <div className="alert alert-info">تم الحفظ ✓</div>}
              {submitted && hasErrors && <div className="alert alert-error">راجعي الحقول المعلّمة بالأحمر</div>}
              {save.isError && <ErrorAlert error={save.error} />}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sizes
function SizePicker({ sizes, onChange }: { sizes: string[]; onChange: (s: string[]) => void }) {
  const initialPreset = SIZE_PRESETS.find((p) => sizes.some((s) => p.sizes.includes(s)))?.key ?? 'letters';
  const [presetKey, setPresetKey] = useState(initialPreset);
  const [custom, setCustom] = useState('');
  const preset = SIZE_PRESETS.find((p) => p.key === presetKey)!;

  const toggle = (size: string) => {
    if (sizes.includes(size)) return onChange(sizes.filter((s) => s !== size));
    // Keep the preset's natural order (S before M before L…).
    const order = (s: string) => {
      const i = preset.sizes.indexOf(s);
      return i === -1 ? 1000 + sizes.indexOf(s) : i;
    };
    onChange([...sizes, size].sort((a, b) => order(a) - order(b)));
  };
  const addCustom = () => {
    const v = custom.trim().toUpperCase();
    if (v && !sizes.includes(v)) onChange([...sizes, v]);
    setCustom('');
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="preset-row">
        <span className="field-label">نظام المقاسات:</span>
        {SIZE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`tab${presetKey === p.key ? ' active' : ''}`}
            onClick={() => setPresetKey(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="size-chips" role="group" aria-label="المقاسات">
        {preset.sizes.map((s) => (
          <button
            key={s}
            type="button"
            className={`size-chip${sizes.includes(s) ? ' on' : ''}`}
            aria-pressed={sizes.includes(s)}
            onClick={() => toggle(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="row">
        <input
          className="input"
          dir="ltr"
          style={{ width: 160 }}
          placeholder="مقاس آخر، مثل 50"
          value={custom}
          maxLength={20}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={addCustom} disabled={!custom.trim()}>
          إضافة المقاس
        </button>
        <span className="spacer" />
        {sizes.length > 0 ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>
            بدون مقاسات (مقاس واحد)
          </button>
        ) : (
          <span className="muted small">بدون مقاسات: المنتج بمقاس واحد</span>
        )}
      </div>
      {sizes.length > 0 && (
        <div className="size-chips">
          <span className="field-label">المختارة:</span>
          {sizes.map((s) => (
            <button key={s} type="button" className="size-chip on" onClick={() => toggle(s)} aria-label={`إزالة ${s}`}>
              {s} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- colours
function ColorPicker({ colors, onChange }: { colors: Color[]; onChange: (c: Color[]) => void }) {
  const [name, setName] = useState('');
  const [hex, setHex] = useState('#5B0E2D');
  const has = (n: string) => colors.some((c) => c.name === n);
  const toggle = (c: Color) => onChange(has(c.name) ? colors.filter((x) => x.name !== c.name) : [...colors, c]);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <span className="field-label">الألوان (اختياري):</span>
      <div className="color-pick">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c.name}
            type="button"
            title={c.name}
            aria-label={c.name}
            aria-pressed={has(c.name)}
            className={has(c.name) ? 'on' : undefined}
            style={{ background: c.hex }}
            onClick={() => toggle(c)}
          />
        ))}
      </div>
      <div className="row">
        <input type="color" value={hex} onChange={(e) => setHex(e.target.value.toUpperCase())} aria-label="اللون" />
        <input
          className="input"
          style={{ width: 160 }}
          placeholder="اسم لون آخر"
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!name.trim() || has(name.trim())}
          onClick={() => {
            onChange([...colors, { name: name.trim(), hex }]);
            setName('');
          }}
        >
          إضافة اللون
        </button>
      </div>
      {colors.length > 0 && (
        <div className="size-chips">
          {colors.map((c) => (
            <button key={c.name} type="button" className="size-chip on" onClick={() => toggle(c)} style={{ direction: 'rtl' }}>
              <span className="color-row">
                <span className="swatch" style={{ background: c.hex }} />
                {c.name} ×
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkFill({ onApply }: { onApply: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="row">
      <span className="muted small">تعبئة نفس الكمية لكل المقاسات:</span>
      <div style={{ width: 150 }}>
        <IntInput value={v} onChange={setV} unit="قطعة" aria-label="كمية للكل" />
      </div>
      <button type="button" className="btn btn-ghost btn-sm" disabled={parseIntInput(v, 0, MAX_STOCK) === null} onClick={() => onApply(v)}>
        تعبئة للكل
      </button>
    </div>
  );
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list)];
}
