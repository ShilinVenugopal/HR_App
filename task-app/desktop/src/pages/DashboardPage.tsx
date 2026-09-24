import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Bell, CalendarClock, CheckCircle2, CircleDashed, Clock3, Layers, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useMe } from '@/context/AuthContext';
import { getTaskStats, listNotifications, listUpcomingAssignments } from '@/lib/api';
import { fmtDateTime, fromNow, taskCode } from '@/lib/format';
import type { StatBlock } from '@/lib/types';
import { PriorityBadge, StatusBadge } from '@/components/badges';
import { Button, EmptyState, ErrorBox, PageHeader, ProgressBar, Skeleton } from '@/components/ui';

const CARDS: { key: keyof StatBlock; label: string; icon: typeof Layers; tone: string; filter?: string }[] = [
  { key: 'total', label: 'Total', icon: Layers, tone: 'from-navy-700 to-brand-600 text-white' },
  { key: 'pending', label: 'Pending', icon: CircleDashed, tone: 'text-amber-600', filter: 'pending' },
  { key: 'in_progress', label: 'In Progress', icon: Clock3, tone: 'text-brand-600', filter: 'in_progress' },
  { key: 'completed', label: 'Completed', icon: CheckCircle2, tone: 'text-emerald-600', filter: 'completed' },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, tone: 'text-rose-600', filter: 'overdue' },
];

function KpiRow({ stats, base }: { stats?: StatBlock; base: string }) {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {CARDS.map(({ key, label, icon: Icon, tone, filter }) => {
        const primary = key === 'total';
        return (
          <button
            key={key}
            onClick={() => navigate(filter ? `${base}?status=${filter}` : base)}
            className={clsx(
              'group rounded-2xl p-4 text-left transition hover:-translate-y-0.5',
              primary ? `bg-gradient-to-br shadow-glow ${tone}` : 'card hover:shadow-md',
            )}
          >
            <div className="flex items-center justify-between">
              <span className={clsx('text-xs font-semibold uppercase tracking-wider', primary ? 'text-white/70' : 'text-slate-500')}>{label}</span>
              <Icon className={clsx('h-4 w-4', primary ? 'text-accent-300' : tone)} />
            </div>
            <div className={clsx('mt-3 text-3xl font-semibold tabular-nums', primary ? 'text-white' : key === 'overdue' && stats?.overdue ? 'text-rose-600' : 'text-navy-900')}>
              {stats ? stats[key] : <Skeleton className="h-8 w-12" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const me = useMe();
  const stats = useQuery({ queryKey: ['stats'], queryFn: getTaskStats });
  const upcoming = useQuery({ queryKey: ['upcoming', me.id], queryFn: () => listUpcomingAssignments(me.id) });
  const notes = useQuery({ queryKey: ['notifications', 'recent'], queryFn: () => listNotifications() });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader
        title={`${greeting}, ${me.full_name.split(' ')[0]}`}
        subtitle="Here's where your tasks stand today."
        actions={
          <Link to="/tasks/new">
            <Button icon={<Plus className="h-4 w-4" />}>Create Task</Button>
          </Link>
        }
      />

      {stats.error && <ErrorBox error={stats.error} />}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">My Tasks</h2>
        <KpiRow stats={stats.data?.mine} base="/tasks/mine" />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Assigned by Me</h2>
        <KpiRow stats={stats.data?.assigned_by_me} base="/tasks/assigned" />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="flex items-center gap-2 font-semibold text-navy-900">
              <CalendarClock className="h-4 w-4 text-brand-500" /> Upcoming deadlines
            </h3>
            <Link to="/tasks/mine" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {upcoming.isLoading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : upcoming.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {upcoming.data.map((a) => (
                <li key={a.assignment_id}>
                  <Link to={`/tasks/${a.task_id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-slate-400">{taskCode(a.task_no)}</span>
                        <PriorityBadge priority={a.priority} />
                      </div>
                      <div className="truncate text-sm font-medium text-slate-800">{a.title}</div>
                      <div className="text-xs text-slate-500">
                        Due {fmtDateTime(a.due_at, a.timezone)} · from {a.created_by_name}
                      </div>
                    </div>
                    <div className="w-28">
                      <ProgressBar value={a.progress} />
                      <div className="mt-1 text-right text-[11px] text-slate-500">{a.progress}%</div>
                    </div>
                    <StatusBadge status={a.effective_status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="You're all caught up" text="No open tasks assigned to you." />
          )}
        </section>

        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="flex items-center gap-2 font-semibold text-navy-900">
              <Bell className="h-4 w-4 text-brand-500" /> Recent notifications
            </h3>
            <Link to="/notifications" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {notes.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {notes.data.slice(0, 6).map((n) => (
                <li key={n.id}>
                  <Link to={n.task_id ? `/tasks/${n.task_id}` : '/notifications'} className="flex gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-slate-200' : 'bg-accent-500')} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                      <span className="line-clamp-2 block text-xs text-slate-500">{n.message}</span>
                      <span className="block text-[11px] text-slate-400">{fromNow(n.created_at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Bell className="h-5 w-5" />} title="No notifications yet" />
          )}
        </section>
      </div>
    </>
  );
}
