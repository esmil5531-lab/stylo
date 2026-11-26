import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';

import { useOrderAlerts } from '@/api/hooks';
import type { Me } from '@/api/types';

import { Count } from './inputs';
import { OrderNo } from './ui';

/**
 * «تنبيهات الطلبات» at the top of every page of the panel (staff with `orders.read`):
 * - a new pending order → a short chime, a browser notification when the tab is hidden, and the
 *   count in the tab title «(2) …» — once per order and per browser (the last order number rung
 *   for is kept in localStorage, so a reload does not ring again);
 * - pending orders older than the alert delay in red, with links to each one;
 * - for dispatchers: confirmed orders still without a driver.
 * Browsers only play sound after the person has clicked somewhere on the page; desktop
 * notifications need https (or localhost) and the person's permission.
 */

const SOUND_KEY = 'stylo-admin-alert-sound';
const seenKey = (userId: string) => `stylo-admin-alerts-seen:${userId}`;

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: alerts still work for this page */
  }
}

let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* no Web Audio */
  }
}
/** Two soft notes (no sound file to load). */
function chime() {
  if (!audio || audio.state !== 'running') return;
  const ctx = audio;
  const t = ctx.currentTime;
  [880, 1175].forEach((freq, i) => {
    const start = t + i * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

/** «منذ 25 د» · «منذ 3 س» · «منذ يومين». */
function waiting(minutes: number): string {
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} س`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'يوم' : days === 2 ? 'يومين' : `${days} أيام`;
}

type NotifyState = NotificationPermission | 'unsupported';
function notifyState(): NotifyState {
  if (typeof window === 'undefined' || !('Notification' in window) || !window.isSecureContext) return 'unsupported';
  return Notification.permission;
}

export function OrderAlertsBar({ me }: { me: Me }) {
  const enabled = me.permissions.includes('orders.read');
  const alerts = useOrderAlerts(enabled);
  const qc = useQueryClient();
  const [soundOn, setSoundOn] = useState(() => readStore(SOUND_KEY) !== 'off');
  const [permission, setPermission] = useState<NotifyState>(notifyState);
  const [fresh, setFresh] = useState<number | null>(null);
  const { pathname } = useLocation();
  const baseTitle = useRef(document.title.replace(/^\(\d+\)\s*/, ''));

  // Any click or key press on the page allows the chime later (browser autoplay rules).
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const newest = alerts.data?.pending.newestOrderNumber ?? null;
  useEffect(() => {
    if (newest === null) return;
    const key = seenKey(me.id);
    const seen = Number(readStore(key) ?? 0);
    writeStore(key, String(Math.max(seen, newest)));
    // First visit on this browser: the orders already waiting are shown, not rung for.
    if (!seen || newest <= seen) return;
    setFresh(newest);
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    if (soundOn) chime();
    if (notifyState() === 'granted' && document.hidden) {
      try {
        new Notification('طلب جديد في ستايلو', {
          body: `الطلب #${newest} بانتظار التأكيد`,
          tag: 'stylo-new-order',
          icon: `${import.meta.env.BASE_URL}favicon.svg`,
        });
      } catch {
        /* some mobile browsers only notify from a service worker */
      }
    }
    // soundOn is read at the moment the order arrives, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest, me.id, qc]);

  const pendingCount = alerts.data?.pending.count ?? 0;
  useEffect(() => {
    document.title = pendingCount > 0 ? `(${pendingCount}) ${baseTitle.current}` : baseTitle.current;
  }, [pendingCount]);
  useEffect(() => {
    const title = baseTitle.current;
    return () => {
      document.title = title;
    };
  }, []);

  if (!enabled || !alerts.data) return null;
  const { pending, late, unassigned, autoCancelMinutes } = alerts.data;
  const anyAlert = pending.count > 0 || late.count > 0 || (unassigned?.count ?? 0) > 0;
  // The sound / notification switches: with an alert, and always on the overview and orders pages.
  const showTools = anyAlert || pathname === '/' || pathname.startsWith('/orders');
  if (!anyAlert && !showTools) return null;
  const toggleSound = () => {
    unlockAudio();
    const next = !soundOn;
    setSoundOn(next);
    writeStore(SOUND_KEY, next ? 'on' : 'off');
    if (next) chime();
  };
  const askPermission = () => {
    unlockAudio();
    void Notification.requestPermission().then(setPermission);
  };

  return (
    <div className="order-alerts" aria-live="polite">
      {pending.count > 0 && (
        <div className={`order-alert tone-new${fresh ? ' is-fresh' : ''}`}>
          <strong>
            طلبات بانتظار التأكيد: <Count value={pending.count} />
          </strong>
          {fresh && (
            <span>
              وصل طلب جديد <OrderNo n={fresh} />
            </span>
          )}
          <Link className="order-alert-link" to="/orders?status=pending" onClick={() => setFresh(null)}>
            عرض الطلبات
          </Link>
        </div>
      )}
      {late.count > 0 && (
        <div className="order-alert tone-late" role="alert">
          <strong>
            طلبات متأخرة: <Count value={late.count} />
          </strong>
          <span>بانتظار التأكيد منذ أكثر من {late.minutes} دقيقة</span>
          <span className="order-alert-items">
            {late.items.slice(0, 3).map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`}>
                <OrderNo n={o.orderNumber} /> · {o.storeName} · منذ {waiting(o.waitingMinutes)}
              </Link>
            ))}
          </span>
          {autoCancelMinutes > 0 && <span className="muted">يُلغى الطلب تلقائياً بعد {autoCancelMinutes} دقيقة من الطلب</span>}
        </div>
      )}
      {unassigned && unassigned.count > 0 && (
        <div className="order-alert tone-info">
          <strong>
            طلبات مؤكدة بلا سائق: <Count value={unassigned.count} />
          </strong>
          <Link className="order-alert-link" to="/orders?status=confirmed">
            إسناد سائق
          </Link>
        </div>
      )}
      {showTools && (
      <div className="order-alert-tools">
        <button type="button" className="btn btn-ghost btn-sm" onClick={toggleSound} aria-pressed={soundOn}>
          {soundOn ? 'صوت التنبيه: يعمل' : 'صوت التنبيه: متوقف'}
        </button>
        {permission === 'default' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={askPermission}>
            تفعيل إشعارات المتصفح للطلبات الجديدة
          </button>
        )}
        {permission === 'denied' && <span className="muted">إشعارات المتصفح محظورة لهذا الموقع (من إعدادات المتصفح)</span>}
      </div>
      )}
    </div>
  );
}
