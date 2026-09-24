// Realtime sync + notifications + connection health.
//
// One Supabase Realtime channel per signed-in user. The database only delivers
// changes the user's RLS policies allow, so subscribing to whole tables is safe.
// Any change simply invalidates the matching React Query caches, and new
// notifications/messages are raised as Windows toasts via the Electron bridge.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  generateReminders,
  getSettings,
  listActiveUsers,
  listUndelivered,
  markNotificationsDelivered,
  unreadMessageCount,
  unreadNotificationCount,
} from '@/lib/api';
import type { AppNotification, Message, UserSettings } from '@/lib/types';
import { useAuth } from './AuthContext';

export type ConnectionState = 'online' | 'connecting' | 'offline';

interface RealtimeState {
  connection: ConnectionState;
  unreadNotifications: number;
  unreadMessages: number;
  /** Chat page registers the open conversation so we don't toast for it. */
  setActiveConversation(id: string | null): void;
}

const RealtimeContext = createContext<RealtimeState | null>(null);

const REMINDER_SWEEP_MS = 10 * 60_000;

const TASK_KEYS = ['stats', 'my-assignments', 'tasks', 'task', 'task-assignments', 'task-activity', 'upcoming'];

function wantsToast(n: AppNotification, s: UserSettings | undefined) {
  if (!s) return true;
  switch (n.type) {
    case 'task_assigned':
      return s.notify_task_assigned;
    case 'task_reminder':
    case 'task_due':
    case 'task_overdue':
      return s.notify_reminders;
    default:
      return s.notify_task_updates;
  }
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();
  const userId = profile?.id ?? null;

  const [connection, setConnection] = useState<ConnectionState>(navigator.onLine ? 'connecting' : 'offline');
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const activeConversation = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const wasDisconnected = useRef(false);

  const settings = useRef<UserSettings | undefined>(undefined);
  const directory = useRef<Map<string, string>>(new Map());

  const refreshCounts = useCallback(async () => {
    try {
      const [n, m] = await Promise.all([unreadNotificationCount(), unreadMessageCount()]);
      setUnreadNotifications(n);
      setUnreadMessages(Number(m));
    } catch {
      /* offline: keep last known counts */
    }
  }, []);

  useEffect(() => {
    window.forays?.setUnreadCount(unreadNotifications + unreadMessages);
  }, [unreadNotifications, unreadMessages]);

  /** Show a toast: Windows notification when the window is not in front, in-app otherwise. */
  const raise = useCallback(async (title: string, body: string, route?: string) => {
    const focused = window.forays ? await window.forays.isWindowFocused() : document.hasFocus();
    if (window.forays && !focused) {
      window.forays.notify({ title, body, route });
    } else {
      toast(
        (t) => (
          <button
            className="text-left"
            onClick={() => {
              toast.dismiss(t.id);
              if (route) window.location.hash = `#${route}`;
            }}
          >
            <div className="font-semibold text-slate-900">{title}</div>
            <div className="text-sm text-slate-600">{body}</div>
          </button>
        ),
        { duration: 6000 },
      );
    }
  }, []);

  /** Toast every notification not yet shown on any device, then mark delivered. */
  const deliverPending = useCallback(async () => {
    try {
      const pending = await listUndelivered();
      if (!pending.length) return;
      const toShow = pending.filter((n) => wantsToast(n, settings.current));
      if (toShow.length > 3) {
        await raise('Forays Task App', `You have ${toShow.length} new notifications`, '/notifications');
      } else {
        for (const n of toShow) await raise(n.title, n.message, n.task_id ? `/tasks/${n.task_id}` : '/notifications');
      }
      await markNotificationsDelivered(pending.map((n) => n.id));
    } catch (err) {
      console.warn('deliverPending failed', err);
    }
  }, [raise]);

  /** Full catch-up after start-up, reconnect or wake from sleep. */
  const catchUp = useCallback(async () => {
    try {
      settings.current = await getSettings();
      const users = await listActiveUsers();
      directory.current = new Map(users.map((u) => [u.id, u.full_name]));
    } catch {
      /* offline */
    }
    // Server-side pg_cron also does this; calling it here means reminders
    // still work if the cron job is not enabled. Idempotent by design.
    await generateReminders().catch(() => undefined);
    await queryClient.invalidateQueries();
    await refreshCounts();
    await deliverPending();
  }, [deliverPending, queryClient, refreshCounts]);

  const subscribe = useCallback(() => {
    if (!userId) return;
    if (channelRef.current) void supabase.removeChannel(channelRef.current);
    setConnection(navigator.onLine ? 'connecting' : 'offline');

    const invalidateTasks = () => TASK_KEYS.forEach((k) => void queryClient.invalidateQueries({ queryKey: [k] }));

    const channel = supabase
      .channel(`user:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, invalidateTasks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignments' }, invalidateTasks)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_activity' }, invalidateTasks)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          const n = payload.new as AppNotification;
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          setUnreadNotifications((c) => c + 1);
          if (wantsToast(n, settings.current)) {
            await raise(n.title, n.message, n.task_id ? `/tasks/${n.task_id}` : '/notifications');
          }
          await markNotificationsDelivered([n.id]).catch(() => undefined);
        },
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        void refreshCounts();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const m = payload.new as Message;
        void queryClient.invalidateQueries({ queryKey: ['messages', m.conversation_id] });
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
        if (m.sender_id === userId) return;
        const focused = window.forays ? await window.forays.isWindowFocused() : document.hasFocus();
        if (focused && activeConversation.current === m.conversation_id) return; // chat page marks it read
        setUnreadMessages((c) => c + 1);
        if (settings.current?.notify_chat ?? true) {
          const from = directory.current.get(m.sender_id) ?? 'New message';
          await raise(from, m.body.length > 140 ? `${m.body.slice(0, 140)}…` : m.body, `/chat/${m.conversation_id}`);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message;
        void queryClient.invalidateQueries({ queryKey: ['messages', m.conversation_id] });
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
        void refreshCounts();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_participants' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('online');
          if (wasDisconnected.current) {
            wasDisconnected.current = false;
            void catchUp();
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // realtime-js keeps retrying on its own; we just reflect the state.
          wasDisconnected.current = true;
          setConnection(navigator.onLine ? 'connecting' : 'offline');
        }
      });
    channelRef.current = channel;
  }, [catchUp, queryClient, raise, refreshCounts, userId]);

  // Start / stop with the session.
  useEffect(() => {
    if (!userId || !session) return;
    void supabase.realtime.setAuth(session.access_token);
    subscribe();
    void catchUp();
    const sweep = window.setInterval(() => {
      void generateReminders().catch(() => undefined);
    }, REMINDER_SWEEP_MS);
    return () => {
      window.clearInterval(sweep);
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
    // Resubscribe only when the signed-in user changes.
  }, [userId]);

  // Keep the realtime socket authorised when the access token refreshes.
  useEffect(() => {
    if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
  }, [session?.access_token]);

  // Network loss / return, and wake from sleep.
  useEffect(() => {
    const goOffline = () => {
      wasDisconnected.current = true;
      setConnection('offline');
    };
    const goOnline = () => {
      setConnection('connecting');
      subscribe();
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    const offResume = window.forays?.onResume(() => {
      wasDisconnected.current = true;
      subscribe();
    });
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      offResume?.();
    };
  }, [subscribe]);

  const setActiveConversation = useCallback((id: string | null) => {
    activeConversation.current = id;
  }, []);

  // Re-count unread whenever the notification or conversation lists refetch.
  useEffect(() => {
    const unsub = queryClient.getQueryCache().subscribe((e) => {
      const key = e.query.queryKey[0];
      if (e.type === 'updated' && e.action.type === 'success' && (key === 'notifications' || key === 'conversations')) {
        void refreshCounts();
      }
    });
    return unsub;
  }, [queryClient, refreshCounts]);

  return (
    <RealtimeContext.Provider value={{ connection, unreadNotifications, unreadMessages, setActiveConversation }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return ctx;
}
