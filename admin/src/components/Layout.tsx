import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router';

import { useMe } from '@/api/hooks';
import type { Me, Permission } from '@/api/types';
import { DEV_IDENTITIES, getActingUserId, setActingUserId } from '@/lib/identity';

import { Async, Icon } from './ui';

const NAV: { to: string; label: string; icon: Parameters<typeof Icon>[0]['name']; permission: Permission }[] = [
  { to: '/', label: 'الرئيسية', icon: 'dashboard', permission: 'dashboard.view' },
  { to: '/orders', label: 'الطلبات', icon: 'orders', permission: 'orders.read' },
  { to: '/stores', label: 'المتاجر', icon: 'stores', permission: 'stores.read' },
  { to: '/staff', label: 'الموظفون والصلاحيات', icon: 'staff', permission: 'staff.read' },
  { to: '/drivers', label: 'السائقون', icon: 'drivers', permission: 'drivers.read' },
];

export function Layout() {
  const me = useMe();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-word">STYLO</div>
          <div className="brand-sub">لوحة الإدارة والعمل</div>
        </div>
        {NAV.filter((n) => me.data?.permissions.includes(n.permission)).map((n) => (
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
          {import.meta.env.DEV && <DevIdentitySwitch />}
        </header>
        <main className="content">
          <Async query={me}>{() => <Outlet />}</Async>
        </main>
      </div>
    </div>
  );
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

/** Development only: act as another seeded staff account to test permissions. */
function DevIdentitySwitch() {
  const qc = useQueryClient();
  return (
    <label className="dev-switch">
      وضع التطوير — الدخول كـ:
      <select
        defaultValue={getActingUserId() ?? undefined}
        onChange={(e) => {
          setActingUserId(e.target.value);
          qc.clear();
          window.location.assign('/');
        }}
      >
        {DEV_IDENTITIES.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
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
