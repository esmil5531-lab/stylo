import { useState } from 'react';

import {
  useAdminLooks,
  useBanners,
  useCategories,
  useDeleteBanner,
  useProducts,
  useReorderBanners,
  useSaveBanner,
  useStores,
} from '@/api/hooks';
import type { Banner, BannerState } from '@/api/types';
import { Async, Badge, Empty, ErrorAlert, Field, Icon, Modal, PageHead } from '@/components/ui';
import { ImageUpload } from '@/components/ImageUpload';
import { isImageUrl, mediaVariant } from '@/lib/media';
import { iconPath } from '@/lib/categoryIcons';
import { formatDateTime } from '@/lib/format';

const STATE: Record<BannerState, { label: string; tone: 'green' | 'amber' | 'gray' | 'red' }> = {
  live: { label: 'معروض', tone: 'green' },
  scheduled: { label: 'مجدول', tone: 'amber' },
  expired: { label: 'منتهي', tone: 'red' },
  hidden: { label: 'مخفي', tone: 'gray' },
};

/** The app shows the first 5 live banners (api: MAX_LIVE_BANNERS). */
const MAX_ON_HOME = 5;

/**
 * «بنرات الرئيسية»: the pink hero carousel of the app. Order, schedule, show/hide, and where the
 * button leads (a screen inside the app, picked from a list — never a typed URL).
 */
export function BannersPage() {
  const banners = useBanners();
  const save = useSaveBanner();
  const reorder = useReorderBanners();
  const [editing, setEditing] = useState<Banner | 'new' | null>(null);

  const move = (list: Banner[], i: number, d: number) => {
    const ids = list.map((b) => b.id);
    const [m] = ids.splice(i, 1);
    ids.splice(i + d, 0, m!);
    reorder.mutate(ids);
  };

  return (
    <div className="stack">
      <PageHead
        title="بنرات الرئيسية"
        subtitle={`الشريط الوردي أعلى الصفحة الرئيسية في التطبيق. يظهر أول ${MAX_ON_HOME} بنرات معروضة بالترتيب، ويمكن جدولة البنر لفترة محددة.`}
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" />
            إضافة بنر
          </button>
        }
      />
      <ErrorAlert error={save.error ?? reorder.error} />
      <Async query={banners}>
        {(items) =>
          items.length === 0 ? (
            <Empty title="لا توجد بنرات" hint="أضيفي أول بنر ليظهر في الصفحة الرئيسية" />
          ) : (
            <div className="banner-list">
              {items.map((b, i) => (
                <section key={b.id} className={`card banner-item${b.onHome ? '' : ' is-off'}`}>
                  <HeroPreview banner={b} />
                  <div className="banner-info">
                    <div className="row">
                      <Badge tone={STATE[b.state].tone}>{STATE[b.state].label}</Badge>
                      {b.state === 'live' && !b.onHome && <Badge tone="gray">خارج أول {MAX_ON_HOME}</Badge>}
                      {b.onHome && <span className="muted small">الترتيب في التطبيق: {items.filter((x) => x.onHome).indexOf(b) + 1}</span>}
                    </div>
                    <div className="small">
                      <span className="muted">يفتح: </span>
                      <LinkLabel link={b.link} />
                    </div>
                    {(b.startsAt || b.endsAt) && (
                      <div className="small muted">
                        {b.startsAt && <>من {formatDateTime(b.startsAt)} </>}
                        {b.endsAt && <>حتى {formatDateTime(b.endsAt)}</>}
                      </div>
                    )}
                    <div className="row">
                      <button className="btn btn-ghost btn-sm" disabled={i === 0 || reorder.isPending} onClick={() => move(items, i, -1)} aria-label={`تقديم ${b.title}`}>
                        ▲
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={i === items.length - 1 || reorder.isPending}
                        onClick={() => move(items, i, 1)}
                        aria-label={`تأخير ${b.title}`}
                      >
                        ▼
                      </button>
                      <button className="btn btn-outline btn-sm" disabled={save.isPending} onClick={() => save.mutate({ id: b.id, isActive: !b.isActive })}>
                        {b.isActive ? 'إخفاء' : 'إظهار'}
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditing(b)}>
                        تعديل
                      </button>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )
        }
      </Async>
      {editing && <BannerForm banner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Same layout as the app's HeroCarousel: text + button on the start side, visual on the end side. */
function HeroPreview({ banner: b }: { banner: Pick<Banner, 'title' | 'subtitle' | 'cta' | 'imageUrl'> }) {
  return (
    <div className="hero-preview" aria-label="معاينة البنر">
      <div className="hero-text">
        <div className="hero-title">{b.title || 'عنوان البنر'}</div>
        {b.cta && <span className="hero-cta">{b.cta}</span>}
        {b.subtitle && <div className="hero-sub">{b.subtitle}</div>}
      </div>
      <div className="hero-visual">
        {b.imageUrl ? (
          <img src={mediaVariant(b.imageUrl, 800)} alt="" />
        ) : (
          <span className="hero-ring">
            <svg viewBox="0 0 24 24" width={34} height={34}>
              <path d={iconPath('hanger')} fill="#fff" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- link builder

type LinkKind = 'none' | 'feed' | 'category' | 'store' | 'look' | 'product' | 'categories';
const FEEDS: { value: string; label: string }[] = [
  { value: 'for_you', label: 'لأجلك' },
  { value: 'trending', label: 'ترند' },
  { value: 'offers', label: 'عروض' },
  { value: 'nearby', label: 'قريب منك' },
  { value: 'new', label: 'وصل حديثاً' },
];

function parseLink(link: string | null): { kind: LinkKind; value: string } {
  if (!link) return { kind: 'none', value: '' };
  if (link === '/categories') return { kind: 'categories', value: '' };
  const m = /^\/(store|look|product)\/(.+)$/.exec(link);
  if (m) return { kind: m[1] as LinkKind, value: m[2]! };
  const q = new URLSearchParams(link.split('?')[1] ?? '');
  if (q.get('feed')) return { kind: 'feed', value: q.get('feed')! };
  if (q.get('category')) return { kind: 'category', value: q.get('category')! };
  return { kind: 'none', value: '' };
}

function buildLink(kind: LinkKind, value: string, title?: string): string | null {
  const t = title ? `&title=${encodeURIComponent(title)}` : '';
  switch (kind) {
    case 'feed':
      return value ? `/products?feed=${value}${t}` : null;
    case 'category':
      return value ? `/products?category=${value}${t}` : null;
    case 'store':
    case 'look':
    case 'product':
      return value ? `/${kind}/${value}` : null;
    case 'categories':
      return '/categories';
    default:
      return null;
  }
}

function LinkLabel({ link }: { link: string | null }) {
  const { kind, value } = parseLink(link);
  const title = new URLSearchParams((link ?? '').split('?')[1] ?? '').get('title');
  switch (kind) {
    case 'none':
      return <span className="muted">لا شيء</span>;
    case 'categories':
      return <>صفحة الأقسام</>;
    case 'feed':
      return <>تبويب «{FEEDS.find((f) => f.value === value)?.label ?? value}»</>;
    case 'category':
      return <>قسم «{title ?? value}»</>;
    case 'store':
      return <>متجر <bdi dir="ltr">{value}</bdi></>;
    case 'look':
      return <>لوك</>;
    case 'product':
      return <>منتج</>;
  }
}

// ---------------------------------------------------------------- form

/** <input type="datetime-local"> value ↔ ISO (the browser's time zone = Libya for staff). */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function BannerForm({ banner, onClose }: { banner: Banner | null; onClose: () => void }) {
  const save = useSaveBanner();
  const remove = useDeleteBanner();
  const initialLink = parseLink(banner?.link ?? '/products?feed=offers');
  const [f, setF] = useState({
    title: banner?.title ?? '',
    subtitle: banner?.subtitle ?? '',
    cta: banner?.cta ?? 'تسوقي الآن',
    imageUrl: banner?.imageUrl ?? '',
    linkKind: initialLink.kind,
    linkValue: initialLink.value,
    isActive: banner?.isActive ?? true,
    startsAt: toLocalInput(banner?.startsAt ?? null),
    endsAt: toLocalInput(banner?.endsAt ?? null),
  });
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const categories = useCategories();
  const stores = useStores({}, f.linkKind === 'store');
  const looks = useAdminLooks({}, f.linkKind === 'look');
  const [productQ, setProductQ] = useState('');
  const products = useProducts({ status: 'active', q: productQ || undefined });

  const categoryName = categories.data?.find((c) => c.slug === f.linkValue)?.nameAr;
  const feedName = FEEDS.find((x) => x.value === f.linkValue)?.label;
  const link = buildLink(f.linkKind, f.linkValue, f.linkKind === 'category' ? categoryName : f.linkKind === 'feed' ? feedName : undefined);

  const errors = {
    title: f.title.trim().length < 2 ? 'اكتبي عنوان البنر' : null,
    link: f.linkKind !== 'none' && f.linkKind !== 'categories' && !f.linkValue ? 'اختاري الصفحة التي يفتحها الزر' : null,
    imageUrl: f.imageUrl && !isImageUrl(f.imageUrl) ? 'رابط صورة غير صالح' : null,
    endsAt: f.startsAt && f.endsAt && f.endsAt <= f.startsAt ? 'الانتهاء بعد البداية' : null,
  };
  const show = (e: string | null) => (submitted ? e : null);

  const submit = () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    save.mutate(
      {
        id: banner?.id,
        title: f.title.trim(),
        subtitle: f.subtitle.trim() || null,
        cta: f.cta.trim() || null,
        imageUrl: f.imageUrl.trim() || null,
        link,
        isActive: f.isActive,
        startsAt: fromLocalInput(f.startsAt),
        endsAt: fromLocalInput(f.endsAt),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      title={banner ? 'تعديل البنر' : 'بنر جديد'}
      onClose={onClose}
      footer={
        <>
          {banner && (
            <button
              className="btn btn-ghost"
              style={{ marginInlineEnd: 'auto', color: 'var(--red)' }}
              disabled={remove.isPending}
              onClick={() => (confirmDelete ? remove.mutate(banner.id, { onSuccess: onClose }) : setConfirmDelete(true))}
            >
              {confirmDelete ? 'تأكيد الحذف' : 'حذف البنر'}
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
      <HeroPreview banner={{ title: f.title, subtitle: f.subtitle, cta: f.cta, imageUrl: isImageUrl(f.imageUrl) ? f.imageUrl : null }} />
      <div className="form-grid" style={{ marginTop: 14 }}>
        <Field label="العنوان" required error={show(errors.title)} full>
          <input className="input" value={f.title} maxLength={60} onChange={(e) => set('title', e.target.value)} autoFocus />
        </Field>
        <Field label="الوصف" hint="سطر قصير تحت الزر (اختياري)">
          <input className="input" value={f.subtitle} maxLength={90} onChange={(e) => set('subtitle', e.target.value)} />
        </Field>
        <Field label="نص الزر" hint="مثل: تسوقي الآن">
          <input className="input" value={f.cta} maxLength={24} onChange={(e) => set('cta', e.target.value)} />
        </Field>

        <div className="form-section">عند الضغط يفتح</div>
        <Field label="نوع الصفحة">
          <select className="select" value={f.linkKind} onChange={(e) => setF((s) => ({ ...s, linkKind: e.target.value as LinkKind, linkValue: '' }))}>
            <option value="feed">تبويب في الرئيسية</option>
            <option value="category">قسم</option>
            <option value="store">متجر</option>
            <option value="look">لوك «كمّل اللوك»</option>
            <option value="product">منتج</option>
            <option value="categories">صفحة الأقسام</option>
            <option value="none">لا شيء</option>
          </select>
        </Field>
        <Field label="الصفحة" required={f.linkKind !== 'none' && f.linkKind !== 'categories'} error={show(errors.link)}>
          {f.linkKind === 'feed' && (
            <select className="select" value={f.linkValue} onChange={(e) => set('linkValue', e.target.value)}>
              <option value="">اختاري…</option>
              {FEEDS.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          )}
          {f.linkKind === 'category' && (
            <select className="select" value={f.linkValue} onChange={(e) => set('linkValue', e.target.value)}>
              <option value="">اختاري…</option>
              {categories.data
                ?.filter((c) => !c.parentId)
                .map((m) => (
                  <optgroup key={m.id} label={m.nameAr}>
                    <option value={m.slug}>{m.nameAr} — الكل</option>
                    {categories.data
                      ?.filter((c) => c.parentId === m.id)
                      .map((c) => (
                        <option key={c.id} value={c.slug}>
                          {c.nameAr}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
          )}
          {f.linkKind === 'store' && (
            <select className="select" value={f.linkValue} onChange={(e) => set('linkValue', e.target.value)}>
              <option value="">اختاري…</option>
              {stores.data?.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.nameAr}
                </option>
              ))}
            </select>
          )}
          {f.linkKind === 'look' && (
            <select className="select" value={f.linkValue} onChange={(e) => set('linkValue', e.target.value)}>
              <option value="">اختاري…</option>
              {looks.data?.map((l) => (
                <option key={l.id} value={l.slug}>
                  {l.title} — {l.store.name}
                </option>
              ))}
            </select>
          )}
          {f.linkKind === 'product' && (
            <div className="stack" style={{ gap: 6 }}>
              <input className="input" placeholder="ابحثي باسم المنتج…" value={productQ} onChange={(e) => setProductQ(e.target.value)} />
              <select className="select" value={f.linkValue} onChange={(e) => set('linkValue', e.target.value)}>
                <option value="">اختاري…</option>
                {products.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameAr} — {p.store.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(f.linkKind === 'none' || f.linkKind === 'categories') && <div className="readonly-value muted">—</div>}
        </Field>

        <div className="form-section">الصورة والجدولة</div>
        <Field label="صورة البنر" error={show(errors.imageUrl)} hint="اختياري — بدونها يظهر الرسم الوردي. صورة عرضية (1600×700 تقريباً)" full group>
          <ImageUpload purpose="banner" shape="wide" value={f.imageUrl} onChange={(u) => set('imageUrl', u)} />
        </Field>
        <Field label="يبدأ في" hint="اختياري">
          <input className="input" type="datetime-local" dir="ltr" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
        </Field>
        <Field label="ينتهي في" error={show(errors.endsAt)} hint="اختياري">
          <input className="input" type="datetime-local" dir="ltr" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
        </Field>
        <label className="check full">
          <input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          معروض في التطبيق
        </label>
      </div>
      <ErrorAlert error={save.error ?? remove.error} />
    </Modal>
  );
}
