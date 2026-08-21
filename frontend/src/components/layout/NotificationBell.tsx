import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { AppNotification, notificationsApi } from '../../api/modules';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

const DOCUMENT_PATH: Record<string, string> = {
  PR: '/purchase-requisitions',
  PO: '/purchase-orders',
  GRN: '/grns',
};

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list({ pageSize: 10 }),
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = data?.data.rows ?? [];
  const unreadCount = data?.data.unreadCount ?? 0;

  const handleClick = (n: AppNotification) => {
    if (!n.isRead) markReadMutation.mutate(n.id);
    if (n.documentType && n.documentId) {
      navigate(`${DOCUMENT_PATH[n.documentType]}/${n.documentId}`);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost relative p-2" onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button className="text-xs text-brand-600 hover:underline" onClick={() => markAllReadMutation.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">No notifications</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  className={`block w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
                    n.isRead ? '' : 'bg-brand-50/60 dark:bg-brand-900/10'
                  }`}
                  onClick={() => handleClick(n)}
                >
                  <p className="font-medium">{n.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
