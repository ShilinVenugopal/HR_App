import { useState } from 'react';
import { Menu, Moon, Sun, LogOut, ChevronDown, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ROLE_LABELS } from '../../types';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';
import { useRef } from 'react';
import { NotificationBell } from './NotificationBell';

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { session, logout, isSuperAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const projectsRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(menuRef, () => setMenuOpen(false));
  useOnClickOutside(projectsRef, () => setProjectsOpen(false));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/75 px-4 backdrop-blur-md print:hidden dark:border-slate-800/70 dark:bg-slate-900/75">
      <div className="flex items-center gap-3">
        <button className="btn-ghost p-2 lg:hidden" onClick={onMenuClick}>
          <Menu size={20} />
        </button>

        <div className="relative" ref={projectsRef}>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-soft transition-colors hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-600"
            onClick={() => setProjectsOpen((v) => !v)}
          >
            <MapPin size={15} className="text-brand-500" />
            {isSuperAdmin ? 'All Projects' : `${session?.projects.length ?? 0} Project${session?.projects.length === 1 ? '' : 's'}`}
            <ChevronDown size={14} className={`transition-transform duration-150 ${projectsOpen ? 'rotate-180' : ''}`} />
          </button>
          {projectsOpen && (
            <div className="animate-scale-in absolute left-0 z-20 mt-2 w-64 origin-top-left rounded-2xl border border-slate-200 bg-white p-2 shadow-card-hover dark:border-slate-700 dark:bg-slate-900">
              <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Assigned Projects</p>
              {isSuperAdmin ? (
                <p className="rounded-lg px-2.5 py-1.5 text-sm text-slate-600 dark:text-slate-300">Unrestricted — all projects</p>
              ) : session?.projects.length ? (
                session.projects.map((p) => (
                  <p key={p.id} className="rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
                    {p.projectName}
                  </p>
                ))
              ) : (
                <p className="px-2.5 py-1.5 text-sm text-slate-400">No projects assigned</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <NotificationBell />
        <button className="btn-ghost p-2" onClick={toggleTheme} aria-label="Toggle dark mode">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="relative ml-1" ref={menuRef}>
          <button
            className="flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-accent-500 text-sm font-semibold text-white shadow-glow">
              {session?.user.name?.charAt(0).toUpperCase()}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold leading-tight text-slate-800 dark:text-slate-100">{session?.user.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{session && ROLE_LABELS[session.user.role]}</p>
            </div>
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div className="animate-scale-in absolute right-0 z-20 mt-2 w-48 origin-top-right rounded-2xl border border-slate-200 bg-white p-1.5 shadow-card-hover dark:border-slate-700 dark:bg-slate-900">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <LogOut size={15} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
