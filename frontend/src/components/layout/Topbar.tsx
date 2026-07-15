import { useState } from 'react';
import { Menu, Moon, Sun, LogOut, ChevronDown, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ROLE_LABELS } from '../../types';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';
import { useRef } from 'react';

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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center gap-3">
        <button className="btn-ghost p-2 lg:hidden" onClick={onMenuClick}>
          <Menu size={20} />
        </button>

        <div className="relative" ref={projectsRef}>
          <button className="btn-secondary" onClick={() => setProjectsOpen((v) => !v)}>
            <MapPin size={15} />
            {isSuperAdmin ? 'All Projects' : `${session?.projects.length ?? 0} Project${session?.projects.length === 1 ? '' : 's'}`}
            <ChevronDown size={14} />
          </button>
          {projectsOpen && (
            <div className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <p className="px-2 py-1 text-xs font-semibold uppercase text-slate-400">Assigned Projects</p>
              {isSuperAdmin ? (
                <p className="px-2 py-1.5 text-sm">Unrestricted — all projects</p>
              ) : session?.projects.length ? (
                session.projects.map((p) => (
                  <p key={p.id} className="rounded px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    {p.projectName}
                  </p>
                ))
              ) : (
                <p className="px-2 py-1.5 text-sm text-slate-400">No projects assigned</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="btn-ghost p-2" onClick={toggleTheme} aria-label="Toggle dark mode">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="relative" ref={menuRef}>
          <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setMenuOpen((v) => !v)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {session?.user.name?.charAt(0).toUpperCase()}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium leading-tight">{session?.user.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{session && ROLE_LABELS[session.user.role]}</p>
            </div>
            <ChevronDown size={14} className="text-slate-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
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
