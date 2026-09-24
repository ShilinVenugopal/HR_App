import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, AlertTriangle, Bell, CheckCheck, CheckCircle2, ClipboardPlus, Info, TrendingUp, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listNotifications, markNotificationsRead } from '@/lib/api';
import { fmtDateTime, fromNow } from '@/lib/format';
import type { AppNotification } from '@/lib/types';
import { Button, EmptyState, ErrorBox, PageHeader, PageLoader } from '@/components/ui';

const ICONS: Record<string, { icon: typeof Bell; tone: string }> = {
  task_assigned: { icon: ClipboardPlus, tone: 'bg-brand-50 text-brand-600' },
  task_updated: { icon: Info, tone: 'bg-sky-50 text-sky-600' },
  task_progress: { icon: TrendingUp, tone: 'bg-accent-300/20 text-accent-600' },
  task_completed: { icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600' },
  task_reminder: { icon: AlarmClock, tone: 'bg-amber-50 text-amber-600' },
  task_due: { icon: AlarmClock, tone: 'bg-orange-50 text-orange-600' },
  task_overdue: { icon: AlertTriangle, tone: 'bg-rose-50 text-rose-600' },
  task_cancelled: { icon: XCircle, tone: 'bg-slate-100 text-slate-500' },
};

export default function NotificationsPage() {
  const [onlyUnread, setOnlyUnread] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['notifications', onlyUnread], queryFn: () => listNotifications(onlyUnread) });

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  function open(n: AppNotification) {
    if (!n.read_at) markRead.mutate([n.id]);
    if (n.task_id) navigate(`/tasks/${n.task_id}`);
    else if (n.conversation_id) navigate(`/chat/${n.conversation_id}`);
  }

  const unread = q.data?.filter((n) => !n.read_at).length ?? 0;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Task assignments, updates, reminders and deadlines."
        actions={
          <>
            <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-slate-200">
              {[false, true].map((u) => (
                <button
                  key={String(u)}
                  onClick={() => setOnlyUnread(u)}
                  className={clsx('rounded-md px-3 py-1 text-xs font-medium', onlyUnread === u ? 'bg-navy-900 text-white' : 'text-slate-600')}
                >
                  {u ? 'Unread' : 'All'}
                </button>
              ))}
            </div>
            <Button variant="secondary" icon={<CheckCheck className="h-4 w-4" />} disabled={!unread} onClick={() => markRead.mutate(undefined)}>
              Mark all read
            </Button>
          </>
        }
      />
      {q.isLoading && <PageLoader />}
      {q.error && <ErrorBox error={q.error} />}
      {q.data && (
        <div className="card divide-y divide-slate-100">
          {q.data.length === 0 && <EmptyState icon={<Bell className="h-5 w-5" />} title={onlyUnread ? 'No unread notifications' : 'No notifications yet'} />}
          {q.data.map((n) => {
            const { icon: Icon, tone } = ICONS[n.type] ?? { icon: Bell, tone: 'bg-slate-100 text-slate-600' };
            return (
              <button key={n.id} onClick={() => open(n)} className={clsx('flex w-full gap-4 px-5 py-4 text-left transition hover:bg-slate-50', !n.read_at && 'bg-brand-50/30')}>
                <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tone)}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={clsx('text-sm', n.read_at ? 'font-medium text-slate-700' : 'font-semibold text-navy-900')}>{n.title}</span>
                    {!n.read_at && <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />}
                  </span>
                  <span className="block text-sm text-slate-600">{n.message}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-slate-400" title={fmtDateTime(n.created_at)}>
                  {fromNow(n.created_at)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
