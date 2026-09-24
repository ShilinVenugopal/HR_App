// App shell: custom title bar (draggable, native caption buttons on the right),
// compact sidebar navigation, and the routed page on a light content area.
import clsx from 'clsx';
import {
  Bell,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageSquare,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Users,
  WifiOff,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, useMe } from '@/context/AuthContext';
import { useRealtime, type ConnectionState } from '@/context/RealtimeContext';
import { Avatar } from './ui';

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a1433" />
          <stop offset="0.55" stopColor="#16285e" />
          <stop offset="1" stopColor="#2a6bff" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#lg-bg)" />
      <rect x="132" y="112" width="60" height="288" rx="16" fill="#fff" />
      <rect x="132" y="112" width="248" height="60" rx="16" fill="#fff" />
      <polyline points="214,268 262,316 384,194" fill="none" stroke="#22d3ee" strokeWidth="52" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConnectionPill({ state }: { state: ConnectionState }) {
  if (state === 'online') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-300/90">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" /> Live
      </span>
    );
  }
  if (state === 'connecting') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" /> Reconnecting…
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300">
      <WifiOff className="h-3 w-3" /> Offline — changes will sync when the connection returns
    </span>
  );
}

export function TitleBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="drag flex h-10 shrink-0 items-center gap-3 border-b border-white/5 bg-navy-900 pl-4 pr-[150px]">
      <Logo className="h-5 w-5" />
      <span className="text-xs font-semibold tracking-[0.2em] text-slate-200">FORAYS TASK APP</span>
      <div className="flex-1" />
      {children}
    </header>
  );
}

interface NavEntry {
  to: string;
  label: string;
  icon: typeof Bell;
  badge?: number;
  end?: boolean;
}

function NavItem({ to, label, icon: Icon, badge, end }: NavEntry) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
          isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent-400" />}
          <Icon className={clsx('h-4 w-4', isActive ? 'text-accent-400' : 'text-slate-500 group-hover:text-slate-300')} />
          <span className="flex-1">{label}</span>
          {!!badge && (
            <span className="min-w-[20px] rounded-full bg-accent-500 px-1.5 text-center text-[11px] font-semibold leading-5 text-navy-950">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const me = useMe();
  const { isAdmin, signOut } = useAuth();
  const { connection, unreadNotifications, unreadMessages } = useRealtime();
  const navigate = useNavigate();

  const nav: NavEntry[] = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/tasks/mine', label: 'My Tasks', icon: ListChecks },
    { to: '/tasks/assigned', label: 'Assigned by Me', icon: Send },
    { to: '/chat', label: 'Chat', icon: MessageSquare, badge: unreadMessages },
    { to: '/notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
  ];
  const adminNav: NavEntry[] = [
    { to: '/users', label: 'Users', icon: Users },
    { to: '/tasks/all', label: 'All Tasks', icon: ClipboardList },
  ];

  return (
    <div className="flex h-full flex-col">
      <TitleBar>
        <div className="no-drag">
          <ConnectionPill state={connection} />
        </div>
      </TitleBar>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col bg-gradient-to-b from-navy-900 via-navy-900 to-navy-950 px-3 pb-3 pt-4">
          <button
            onClick={() => navigate('/tasks/new')}
            className="mb-5 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> Create Task
          </button>

          <nav className="space-y-0.5">
            {nav.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </nav>

          {isAdmin && (
            <>
              <div className="mb-1 mt-6 flex items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                <ShieldCheck className="h-3 w-3" /> Admin
              </div>
              <nav className="space-y-0.5">
                {adminNav.map((n) => (
                  <NavItem key={n.to} {...n} />
                ))}
              </nav>
            </>
          )}

          <div className="flex-1" />
          <nav className="mb-3 space-y-0.5">
            <NavItem to="/settings" label="Settings" icon={Settings} />
          </nav>

          <div className="glass flex items-center gap-3 rounded-xl p-2.5">
            <NavLink to="/profile" className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={me.full_name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-100">{me.full_name}</span>
                <span className="block truncate text-[11px] text-slate-400">{me.designation || me.email}</span>
              </span>
            </NavLink>
            <button
              onClick={() => void signOut()}
              className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto rounded-tl-2xl bg-slate-50">
          <div className="mx-auto max-w-7xl animate-fade-in px-8 py-7">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
