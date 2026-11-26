import { useMemo, useState } from 'react';

import { useMe, useReport, useStores } from '@/api/hooks';
import type { Report } from '@/api/types';
import { Count, Money, Num, Percent } from '@/components/inputs';
import { useCan } from '@/components/Layout';
import { Async, PageHead } from '@/components/ui';
import { formatLYD } from '@/lib/format';
import { formatBps, formatInt } from '@/lib/numbers';

type Preset = '7' | '30' | '90' | 'month' | 'custom';

const PRESETS: { key: Preset; label: string }[] = [
  { key: '7', label: 'آخر 7 أيام' },
  { key: '30', label: 'آخر 30 يوماً' },
  { key: '90', label: 'آخر 90 يوماً' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'custom', label: 'مخصص' },
];

/** Today in Libya as YYYY-MM-DD. */
function libyaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli' }).format(new Date());
}
function shift(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function rangeFor(p: Preset, custom: { from: string; to: string }) {
  const today = libyaToday();
  if (p === 'custom') return custom;
  if (p === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: shift(today, -(Number(p) - 1)), to: today };
}

export function ReportsPage() {
  const me = useMe().data;
  const platform = !me?.store;
  const [preset, setPreset] = useState<Preset>('30');
  const [custom, setCustom] = useState(() => ({ from: shift(libyaToday(), -29), to: libyaToday() }));
  const [storeId, setStoreId] = useState('');
  const range = rangeFor(preset, custom);
  const report = useReport({ ...range, storeId: storeId || undefined });
  const stores = useStores({}, useCan('stores.read'));
  const canReadStores = useCan('stores.read');
  // Commission is visible to the general manager only (the API strips it for everyone else).
  const finance = useCan('finance.view');

  return (
    <div className="stack">
      <PageHead
        title={me?.store ? `تقارير «${me.store.name}»` : 'التقارير والأرباح'}
        subtitle="المبالغ بالدينار الليبي (د.ل) وحسب أيام توقيت ليبيا"
      />

      <div className="card card-pad range-bar">
        <div className="tabs">
          {PRESETS.map((p) => (
            <button key={p.key} className={`tab${preset === p.key ? ' active' : ''}`} onClick={() => setPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <label className="field">
              <span className="field-label">من</span>
              <input
                type="date"
                className="input"
                dir="ltr"
                value={custom.from}
                max={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              />
            </label>
            <label className="field">
              <span className="field-label">إلى</span>
              <input
                type="date"
                className="input"
                dir="ltr"
                value={custom.to}
                min={custom.from}
                max={libyaToday()}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              />
            </label>
          </>
        )}
        <span className="spacer" />
        {platform && canReadStores && (
          <label className="field">
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
        )}
      </div>

      <Async query={report}>{(r) => <ReportBody report={r} storeView={!platform} finance={finance} />}</Async>
    </div>
  );
}

function ReportBody({ report: r, storeView, finance }: { report: Report; storeView: boolean; finance: boolean }) {
  const s = r.summary;
  // Store dues: a store sees its own; platform staff only with finance.view.
  const dues = finance || storeView;
  const [asTable, setAsTable] = useState(false);
  return (
    <>
      <div className="muted small">
        الفترة: من <Num>{r.range.from}</Num> إلى <Num>{r.range.to}</Num> (<Num>{r.range.days}</Num> يوماً)
      </div>

      <div className="kpi-grid">
        {storeView ? (
          <Kpi emph label="صافي مستحقاتك" value={<Money value={s.storePayout ?? 0} />} hint="ما يُحوَّل لمتجرك عن هذه الطلبات" />
        ) : finance ? (
          <Kpi emph label="إيراد ستايلو" value={<Money value={s.styloRevenue ?? 0} />} hint="العمولة + رسوم التوصيل" />
        ) : null}
        <Kpi
          emph={!storeView && !finance}
          label="المبيعات"
          value={<Money value={s.sales} />}
          hint={<>منها تم تسليمه: <Money value={s.realisedSales} /></>}
        />
        {finance && (
          <Kpi
            label="عمولة ستايلو"
            value={<Money value={s.commission ?? 0} />}
            hint={<>نسبة فعلية <Percent bps={s.effectiveCommissionBps ?? 0} /> من المبيعات</>}
          />
        )}
        {storeView ? (
          <Kpi label="رسوم التوصيل" value={<Money value={s.deliveryFees} />} hint="يحصّلها ستايلو مقابل التوصيل المباشر" />
        ) : (
          finance && <Kpi label="مستحقات المتاجر" value={<Money value={s.storePayout ?? 0} />} hint="المبيعات ناقص العمولة والمرتجعات" />
        )}
        <Kpi
          label="الطلبات"
          value={<Count value={s.orders} />}
          hint={
            <>
              <Num>{s.delivered}</Num> تم تسليمها · <Num>{s.open}</Num> مفتوحة · <Num>{s.cancelled}</Num> ملغاة
            </>
          }
        />
        <Kpi label="متوسط قيمة الطلب" value={<Money value={s.averageOrderValue} />} hint="دون رسوم التوصيل" />
        <Kpi label="نسبة الإلغاء" value={<Percent bps={s.cancellationRateBps} />} hint={<>قيمة الملغى: <Money value={s.cancelledSales} /></>} />
        <Kpi
          label="المرتجعات"
          value={<Money value={s.returnedSales} />}
          hint={
            <>
              <Num>{s.returnsCount}</Num> مرتجع · صافي المبيعات <Money value={s.netSales} />
            </>
          }
        />
        {!storeView && <Kpi label="رسوم التوصيل" value={<Money value={s.deliveryFees} />} hint="التوصيل المباشر بسائقي ستايلو" />}
      </div>

      <section className="card card-pad">
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>
            المبيعات اليومية
          </div>
          <span className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => setAsTable((v) => !v)}>
            {asTable ? 'عرض كرسم' : 'عرض كجدول'}
          </button>
        </div>
        {asTable ? <DailyTable daily={r.daily} finance={finance} /> : <DailyChart daily={r.daily} finance={finance} />}
      </section>

      <section className="card">
        <div className="card-pad row">
          <div className="card-title" style={{ margin: 0 }}>
            {storeView ? 'ملخص المتجر' : finance ? 'المتاجر: المبيعات والعمولات' : 'المتاجر: المبيعات'}
          </div>
          <span className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => downloadCsv(r, finance)}>
            تصدير CSV (Excel)
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>المتجر</th>
                {finance && <th>نسبة العمولة</th>}
                <th>الطلبات</th>
                <th>الملغاة</th>
                <th>المبيعات</th>
                {!storeView && <th>الحصة</th>}
                {finance && <th>العمولة</th>}
                {dues && <th>مستحقات المتجر</th>}
                <th>رسوم التوصيل</th>
              </tr>
            </thead>
            <tbody>
              {r.byStore.map((b) => (
                <tr key={b.storeId}>
                  <td className="cell-title">{b.storeName}</td>
                  {finance && (
                    <td>
                      <Percent bps={b.currentCommissionBps ?? 0} />
                    </td>
                  )}
                  <td>
                    <Count value={b.orders} />
                  </td>
                  <td>
                    <Count value={b.cancelled} />
                  </td>
                  <td className="strong">
                    <Money value={b.sales} />
                  </td>
                  {!storeView && (
                    <td>
                      <div className="share-bar" title={formatBps(share(b.sales, s.sales))}>
                        <span style={{ width: `${share(b.sales, s.sales) / 100}%` }} />
                      </div>
                    </td>
                  )}
                  {finance && (
                    <td>
                      <Money value={b.commission ?? 0} />
                    </td>
                  )}
                  {dues && (
                    <td>
                      <Money value={b.payout ?? 0} />
                    </td>
                  )}
                  <td>
                    <Money value={b.deliveryFees} />
                  </td>
                </tr>
              ))}
            </tbody>
            {!storeView && (
              <tfoot>
                <tr className="strong">
                  <td>الإجمالي</td>
                  {finance && (
                    <td>
                      <Percent bps={s.effectiveCommissionBps ?? 0} />
                    </td>
                  )}
                  <td>
                    <Count value={s.orders} />
                  </td>
                  <td>
                    <Count value={s.cancelled} />
                  </td>
                  <td>
                    <Money value={s.sales} />
                  </td>
                  <td />
                  {finance && (
                    <td>
                      <Money value={s.commission ?? 0} />
                    </td>
                  )}
                  {dues && (
                    <td>
                      <Money value={s.storePayout ?? 0} />
                    </td>
                  )}
                  <td>
                    <Money value={s.deliveryFees} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {finance && (
        <p className="card-pad muted small" style={{ margin: 0 }}>
          نسبة العمولة المعروضة هي النسبة الحالية للمتجر. عمولة كل طلب تُحسب بالنسبة السارية وقت الشراء، لذلك لا
          تتغير الأرقام السابقة عند تعديل النسبة.
        </p>
        )}
      </section>

      <section className="card">
        <div className="card-pad">
          <div className="card-title" style={{ margin: 0 }}>
            الأكثر مبيعاً
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>المنتج</th>
                {!storeView && <th>المتجر</th>}
                <th>القطع المباعة</th>
                <th>المبيعات</th>
              </tr>
            </thead>
            <tbody>
              {r.topProducts.map((p, i) => (
                <tr key={`${p.name}-${p.storeName}`}>
                  <td>
                    <Num>{i + 1}.</Num> {p.name}
                  </td>
                  {!storeView && <td>{p.storeName}</td>}
                  <td>
                    <Count value={p.quantity} />
                  </td>
                  <td className="strong">
                    <Money value={p.sales} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="card card-pad">
        <summary className="strong">كيف تُحسب الأرقام؟</summary>
        <ul className="muted" style={{ marginBottom: 0 }}>
          <li>المبيعات: قيمة المنتجات في الطلبات غير الملغاة، دون رسوم التوصيل.</li>
          {finance ? (
            <>
              <li>عمولة ستايلو: نسبة المتجر وقت الشراء × قيمة المنتجات.</li>
              <li>مستحقات المتجر: المبيعات ناقص العمولة.</li>
              <li>إيراد ستايلو: العمولة + رسوم التوصيل (التوصيل المباشر بسائقي ستايلو).</li>
            </>
          ) : (
            <li>مستحقات المتجر: ما يُحوَّل للمتجر عن طلباته المسلّمة.</li>
          )}
          <li>«تم تسليمه» يشمل الطلبات المسلّمة فقط؛ الطلبات المفتوحة قد تُلغى لاحقاً.</li>
        </ul>
      </details>
    </>
  );
}

function share(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 10_000) : 0;
}

function Kpi({
  label,
  value,
  hint,
  emph,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  emph?: boolean;
}) {
  return (
    <div className={`card kpi${emph ? ' emph' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- daily chart
// One series (sales, brand colour), time left→right like the axis numbers, rounded data-end
// anchored to the baseline, recessive grid, hover tooltip with the exact values, table fallback.

const W = 820;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 26, left: 64 };

function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function shortDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${Number(d)}/${Number(m)}`;
}

function DailyChart({ daily, finance }: { daily: Report['daily']; finance: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => niceMax(Math.max(...daily.map((d) => d.sales), 0)), [daily]);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(daily.length, 1);
  const barW = Math.max(2, Math.min(18, band * 0.62));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.ceil(daily.length / 10);
  const h = hover !== null ? daily[hover] : null;

  return (
    <div className="chart" dir="ltr" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="المبيعات اليومية بالدينار الليبي">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="axis-label" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">
              {formatInt(Math.round(t / 1000))}
            </text>
          </g>
        ))}
        <text className="axis-label" x={4} y={PAD.top + 4}>
          د.ل
        </text>
        {daily.map((d, i) => {
          const x = PAD.left + i * band + (band - barW) / 2;
          const top = y(d.sales);
          const hgt = PAD.top + innerH - top;
          return (
            <g key={d.day}>
              {hgt > 0 && <path className={`bar${hover === i ? ' hover' : ''}`} d={roundedTop(x, top, barW, hgt, Math.min(4, barW / 2))} />}
              {i % labelEvery === 0 && (
                <text className="axis-label" x={x + barW / 2} y={H - 8} textAnchor="middle">
                  {shortDay(d.day)}
                </text>
              )}
              {/* Hit target: the whole column, wider than the bar. */}
              <rect
                x={PAD.left + i * band}
                y={PAD.top}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div
          className="chart-tip"
          dir="rtl"
          style={{
            left: `${((PAD.left + hover * band + band / 2) / W) * 100}%`,
            top: `${(y(h.sales) / H) * 100}%`,
          }}
        >
          <div className="strong">
            <Num>{h.day}</Num>
          </div>
          <div>المبيعات: {formatLYD(h.sales)}</div>
          <div className="muted">
            الطلبات: <Num>{h.orders}</Num>
            {finance && <> · العمولة: {formatLYD(h.commission ?? 0)}</>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Bar with rounded top corners and a square base on the axis. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function DailyTable({ daily, finance }: { daily: Report['daily']; finance: boolean }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            <th>اليوم</th>
            <th>الطلبات</th>
            <th>المبيعات</th>
            {finance && <th>العمولة</th>}
          </tr>
        </thead>
        <tbody>
          {[...daily].reverse().map((d) => (
            <tr key={d.day}>
              <td>
                <Num>{d.day}</Num>
              </td>
              <td>
                <Count value={d.orders} />
              </td>
              <td>
                <Money value={d.sales} />
              </td>
              {finance && (
                <td>
                  <Money value={d.commission ?? 0} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function downloadCsv(r: Report, finance: boolean) {
  const lyd = (v: number) => (v / 1000).toFixed(3);
  const rows = finance
    ? [
        ['المتجر', 'نسبة العمولة %', 'الطلبات', 'الملغاة', 'المبيعات (د.ل)', 'العمولة (د.ل)', 'مستحقات المتجر (د.ل)', 'رسوم التوصيل (د.ل)'],
        ...r.byStore.map((b) => [
          b.storeName,
          ((b.currentCommissionBps ?? 0) / 100).toString(),
          String(b.orders),
          String(b.cancelled),
          lyd(b.sales),
          lyd(b.commission ?? 0),
          lyd(b.payout ?? 0),
          lyd(b.deliveryFees),
        ]),
      ]
    : [
        ['المتجر', 'الطلبات', 'الملغاة', 'المبيعات (د.ل)', ...(r.byStore[0]?.payout !== undefined ? ['مستحقات المتجر (د.ل)'] : []), 'رسوم التوصيل (د.ل)'],
        ...r.byStore.map((b) => [
          b.storeName,
          String(b.orders),
          String(b.cancelled),
          lyd(b.sales),
          ...(b.payout !== undefined ? [lyd(b.payout)] : []),
          lyd(b.deliveryFees),
        ]),
      ];
  const csv = rows.map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  // BOM so Excel opens Arabic text correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `stylo-report-${r.range.from}_${r.range.to}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
