import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NAV_ITEMS, NavGroup, NavItem, isNavGroup } from './navConfig';
import { APP_NAME, LOGO_PATH } from '../../config/branding';

const leafLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`;

export function Sidebar({ open }: { open: boolean }) {
  const { can, isSuperAdmin } = useAuth();
  const location = useLocation();

  const isItemVisible = (item: NavItem) => {
    if (item.superAdminOnly) return isSuperAdmin;
    if (item.alwaysVisible) return true;
    return item.module ? can(item.module, item.requiredAction ?? 'view') : false;
  };

  const isItemActive = (item: NavItem) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

  // Groups reduced to only their visible children; a group with no visible
  // children is dropped entirely rather than shown empty.
  const visibleEntries = NAV_ITEMS.map((entry) => {
    if (isNavGroup(entry)) {
      const children = entry.children.filter(isItemVisible);
      return children.length ? { ...entry, children } : null;
    }
    return isItemVisible(entry) ? entry : null;
  }).filter((entry): entry is NavGroup | NavItem => entry !== null);

  const visibleGroups = visibleEntries.filter(isNavGroup);
  const activeGroupLabels = visibleGroups.filter((g) => g.children.some(isItemActive)).map((g) => g.label);

  // Whichever group contains the active route starts expanded — this covers
  // both a fresh page load/refresh and a direct link into a child page.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(activeGroupLabels));

  // Keep the active route's group expanded as navigation happens (e.g. the
  // user follows an in-app link into a group's page while it's collapsed),
  // without collapsing any group the user has manually opened.
  useEffect(() => {
    setExpanded((prev) => {
      const missing = activeGroupLabels.filter((label) => !prev.has(label));
      if (!missing.length) return prev;
      return new Set([...prev, ...missing]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleGroup = (label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 w-64 transform overflow-y-auto border-r border-slate-200 bg-white transition-transform duration-200 print:hidden dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-800">
        <img src={LOGO_PATH} alt="Forays Group" className="h-9 w-9 object-contain" />
        <p className="text-sm font-semibold leading-tight">{APP_NAME}</p>
      </div>

      <nav className="space-y-1 p-3">
        {visibleEntries.map((entry) =>
          isNavGroup(entry) ? (
            <div key={entry.label}>
              <button
                type="button"
                onClick={() => toggleGroup(entry.label)}
                aria-expanded={expanded.has(entry.label)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  entry.children.some(isItemActive)
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <entry.icon size={18} />
                <span className="flex-1 text-left">{entry.label}</span>
                {expanded.has(entry.label) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              {expanded.has(entry.label) && (
                <div className="ml-4 mt-1 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                  {entry.children.map((item) => (
                    <NavLink key={item.path} to={item.path} className={leafLinkClass}>
                      <item.icon size={16} />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <NavLink key={entry.path} to={entry.path} className={leafLinkClass}>
              <entry.icon size={18} />
              {entry.label}
            </NavLink>
          )
        )}
      </nav>
    </aside>
  );
}
