import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { useMe } from '@/api/hooks';
import type { Me, Permission } from '@/api/types';
import { request, ApiError, errorMessage } from '@/api/client';
import { clearToken, getToken } from '@/lib/session';
import { LoginPage } from '@/pages/Login';

import { Async, Empty, Icon } from './ui';

const NAV: {
  to: string;
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  permission: Permission;
  /** Only for staff tied to one store (e.g. «إعدادات متجري»). */
  storeOnly?: boolean;
}[] = [
  { to: '/', label: 'الرئيسية', icon: 'dashboard', permission: 'dashboard.view' },
  { to: '/orders', label: 'الطلبات', icon: 'orders', permission: 'orders.read' },
  { to: '/products', label: 'المنتجات والمقاسات', icon: 'products', permission: 'products.read' },
  { to: '/categories', label: 'الأقسام', icon: 'categories', permission: 'categories.manage' },
  { to: '/looks', label: 'كمّل اللوك', icon: 'looks', permission: 'looks.manage' },
  { to: '/banners', label: 'بنرات الرئيسية', icon: 'banners', permission: 'banners.manage' },
  { to: '/reviews', label: 'التقييمات', icon: 'star', permission: 'reviews.manage' },
  { to: '/reports', label: 'التقارير والأرباح', icon: 'reports', permission: 'reports.view' },
  { to: '/payouts', label: 'مستحقات المتاجر', icon: 'payouts', permission: 'payouts.read' },
  { to: '/custody', label: 'عُهدة المناديب', icon: 'custody', permission: 'custody.read' },
  { to: '/my-store', label: 'إعدادات متجري', icon: 'settings', permission: 'store.profile', storeOnly: true },
  { to: '/stores', label: 'المتاجر', icon: 'stores', permission: 'stores.read' },
  { to: '/staff', label: 'الموظفون والصلاحيات', icon: 'staff', permission: 'staff.read' },
  { to: '/drivers', label: 'السائقون', icon: 'drivers', permission: 'drivers.read' },
];

/** Re-renders when the session token changes (sign-in, sign-out, expiry). */
function useSessionToken(): string | null {
  const [token, set] = useState(getToken);
  useEffect(() => {
    const sync = () => set(getToken());
    window.addEventListener('stylo-session', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('stylo-session', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return token;
}

export function Layout() {
  const token = useSessionToken();
  const qc = useQueryClient();
  // A new session (or none) must never see the previous user's cached data. Clear it *before*
  // rendering the signed-in screens: clearing in an effect would cancel their first requests.
  const [lastToken, setLastToken] = useState(token);
  if (lastToken !== token) {
    setLastToken(token);
    qc.clear();
  }
  if (!token) return <LoginPage />;
  return <SignedIn key={token} />;
}

function SignedIn() {
  const me = useMe();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  // Phones: the menu is a drawer; it closes on navigation and with Escape.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  useTableCardLabels(contentRef);
  if (me.isError) {
    const err = me.error;
    // Signed in, but not (or no longer) allowed into the back office.
    if (err instanceof ApiError && err.status === 403) {
      clearToken();
      return <LoginPage notice={errorMessage(err)} />;
    }
  }
  return (
    <div className={`shell${menuOpen ? ' menu-open' : ''}`}>
      <aside className="sidebar" id="admin-menu">
        <div className="brand">
          <img className="brand-logo" src={`${import.meta.env.BASE_URL}brand/logo-horizontal-reversed.svg`} alt="STYLO — MORE THAN FASHION" />
          {/* STYLO Admin for Stylo staff, STYLO Store for a store's own team. */}
          <div className="brand-sub">
            <span className="brand-pill">{me.data?.store ? 'STYLO STORE' : 'STYLO ADMIN'}</span>
            {me.data?.store ? 'لوحة المتجر' : 'لوحة الإدارة والعمل'}
          </div>
        </div>
        {NAV.filter(
          (n) => me.data?.permissions.includes(n.permission) && (!n.storeOnly || !!me.data?.store),
        ).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-link">
            <Icon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">ستايلو — كل ستايل في مكان واحد</div>
      </aside>

      <div className="menu-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="menu-btn"
            aria-label="القائمة"
            aria-expanded={menuOpen}
            aria-controls="admin-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name={menuOpen ? 'x' : 'menu'} size={22} />
          </button>
          {me.data ? <Who me={me.data} /> : <span />}
          <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
            تسجيل الخروج
          </button>
        </header>
        <main className="content" ref={contentRef}>
          <Async query={me}>
            {(m) =>
              canOpen(m, location.pathname) ? (
                <Outlet />
              ) : (
                <Empty title="ليست لديك صلاحية لهذه الصفحة" hint="اطلبي الصلاحية من مدير ستايلو إن كنتِ تحتاجينها." />
              )
            }
          </Async>
        </main>
      </div>
    </div>
  );
}

/**
 * Phones show tables as cards (CSS, ≤ 700 px): each cell needs its column title as `data-label`.
 * Pages keep plain <table className="table"> markup; this copies the <th> text onto the cells
 * whenever the content changes. Add `table-scroll` to a table that must stay a grid (inputs matrix).
 */
function useTableCardLabels(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const label = () => {
      for (const table of root.querySelectorAll<HTMLTableElement>('table.table:not(.table-scroll)')) {
        const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
        for (const row of table.querySelectorAll<HTMLTableRowElement>('tbody tr, tfoot tr')) {
          [...row.cells].forEach((cell, i) => {
            const text = cell.colSpan > 1 ? '' : (heads[i] ?? '');
            if (cell.dataset.label !== text) cell.dataset.label = text;
          });
        }
      }
    };
    label();
    const observer = new MutationObserver(label);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ref]);
}

/**
 * A page typed directly in the address bar is opened only with its permission (the same one that
 * shows it in the menu), so it never fires requests the API would refuse. The API stays the guard.
 */
function canOpen(me: Me, pathname: string): boolean {
  const item = NAV.find((n) => n.to !== '/' && (pathname === n.to || pathname.startsWith(`${n.to}/`)));
  return !item || me.permissions.includes(item.permission);
}

async function signOut() {
  try {
    await request('POST', '/auth/logout');
  } catch {
    /* the session may already be gone */
  }
  clearToken();
}

function Who({ me }: { me: Me }) {
  return (
    <div className="who">
      <div className="avatar">{me.fullName.charAt(0)}</div>
      <div>
        <div className="who-name">{me.fullName}</div>
        <div className="who-role">
          {me.role.name}
          {me.store ? ` · ${me.store.name}` : ''}
        </div>
      </div>
    </div>
  );
}

/** Hides children unless the signed-in staff member has the permission. */
export function Can({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const me = useMe();
  return me.data?.permissions.includes(permission) ? <>{children}</> : null;
}

export function useCan(permission: Permission): boolean {
  return useMe().data?.permissions.includes(permission) ?? false;
}
