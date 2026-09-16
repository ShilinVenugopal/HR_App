import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NAV_ITEMS, NavGroup, NavItem, isNavGroup } from './navConfig';
import { APP_NAME, COMPANY_NAME } from '../../config/branding';
import { BrandMark } from '../common/BrandMark';

const leafLinkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
    isActive
      ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-glow'
      : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
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
      className={`fixed inset-y-0 left-0 z-30 flex w-64 transform flex-col overflow-y-auto border-r border-white/5 bg-gradient-to-b from-brand-950 via-[#0d0c26] to-brand-950 transition-transform duration-200 print:hidden lg:static lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/5 px-5">
        <BrandMark size={34} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold tracking-wide text-white">{APP_NAME}</p>
          <p className="truncate text-[10px] font-medium uppercase tracking-widest text-accent-300/80">HR / ERP Platform</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {visibleEntries.map((entry) =>
          isNavGroup(entry) ? (
            <div key={entry.label}>
              <button
                type="button"
                onClick={() => toggleGroup(entry.label)}
                aria-expanded={expanded.has(entry.label)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  entry.children.some(isItemActive)
                    ? 'bg-white/[0.06] text-accent-300'
                    : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <entry.icon size={18} />
                <span className="flex-1 text-left">{entry.label}</span>
                <ChevronDown
                  size={15}
                  className={`text-slate-500 transition-transform duration-200 ${expanded.has(entry.label) ? 'rotate-0' : '-rotate-90'}`}
                />
              </button>
              {expanded.has(entry.label) && (
                <div className="animate-fade-in ml-[1.15rem] mt-1 space-y-0.5 border-l border-white/10 py-0.5 pl-3.5">
                  {entry.children.map((item) => (
                    <NavLink key={item.path} to={item.path} className={leafLinkClass}>
                      <item.icon size={15} />
                      <span className="truncate">{item.label}</span>
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

      <div className="border-t border-white/5 px-5 py-3">
        <p className="truncate text-[11px] font-medium text-slate-500">{COMPANY_NAME} &copy; {new Date().getFullYear()}</p>
      </div>
    </aside>
  );
}
