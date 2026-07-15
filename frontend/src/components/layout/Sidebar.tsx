import { NavLink } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { NAV_ITEMS } from './navConfig';

export function Sidebar({ open }: { open: boolean }) {
  const { can, isSuperAdmin } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.superAdminOnly) return isSuperAdmin;
    return can(item.module, 'view');
  });

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 w-64 transform border-r border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Building2 size={18} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Forays Group</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">HR Solutions</p>
        </div>
      </div>

      <nav className="space-y-1 p-3">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
