import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import { useMe } from '@/api/hooks';
import type { Me, Permission } from '@/api/types';
import { request, ApiError, errorMessage } from '@/api/client';
import { clearToken, getToken } from '@/lib/session';
import { LoginPage } from '@/pages/Login';

import { Async, Icon } from './ui';

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
  if (me.isError) {
    const err = me.error;
    // Signed in, but not (or no longer) allowed into the back office.
    if (err instanceof ApiError && err.status === 403) {
      clearToken();
      return <LoginPage notice={errorMessage(err)} />;
    }
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-word">STYLO</div>
          <div className="brand-sub">لوحة الإدارة والعمل</div>
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

      <div className="main">
        <header className="topbar">
          {me.data ? <Who me={me.data} /> : <span />}
          <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
            تسجيل الخروج
          </button>
        </header>
        <main className="content">
          <Async query={me}>{() => <Outlet />}</Async>
        </main>
      </div>
    </div>
  );
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
