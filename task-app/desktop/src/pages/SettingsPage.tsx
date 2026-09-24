import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Info, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useMe } from '@/context/AuthContext';
import { getSettings, updateSettings } from '@/lib/api';
import type { UserSettings } from '@/lib/types';
import type { AppInfo, DesktopPrefs } from '../../electron/bridge';
import { Logo } from '@/components/Layout';
import { ErrorBox, PageHeader, PageLoader, Toggle } from '@/components/ui';

const REMINDER_OPTIONS = [
  { minutes: 1440, label: '1 day before' },
  { minutes: 240, label: '4 hours before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 10, label: '10 minutes before' },
];

function Section({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 font-semibold text-navy-900">
        <Icon className="h-4 w-4 text-brand-500" /> {title}
      </h2>
      <div className="divide-y divide-slate-100 px-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const [prefs, setPrefs] = useState<DesktopPrefs | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.forays?.getPrefs().then(setPrefs);
    void window.forays?.getAppInfo().then(setInfo);
  }, []);

  const save = useMutation({
    mutationFn: (patch: Partial<UserSettings>) => updateSettings(me.id, patch),
    onMutate: (patch) => {
      queryClient.setQueryData<UserSettings>(['settings'], (old) => (old ? { ...old, ...patch } : old));
    },
    onError: (e) => {
      toast.error((e as Error).message);
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  async function setPref(patch: Partial<DesktopPrefs>) {
    if (!window.forays) return;
    setPrefs(await window.forays.setPrefs(patch));
  }

  if (settings.isLoading) return <PageLoader />;
  if (settings.error) return <ErrorBox error={settings.error} />;
  const s = settings.data!;

  const toggleOffset = (m: number) => {
    const next = s.reminder_offsets_minutes.includes(m) ? s.reminder_offsets_minutes.filter((x) => x !== m) : [...s.reminder_offsets_minutes, m];
    save.mutate({ reminder_offsets_minutes: next.sort((a, b) => b - a) });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Notifications, reminders and desktop behaviour." />

      <Section icon={BellRing} title="Notifications">
        <Toggle label="New task assigned to me" checked={s.notify_task_assigned} onChange={(v) => save.mutate({ notify_task_assigned: v })} />
        <Toggle
          label="Task updates"
          description="Progress, completion, edits and cancellations on tasks you're involved in"
          checked={s.notify_task_updates}
          onChange={(v) => save.mutate({ notify_task_updates: v })}
        />
        <Toggle label="Deadline reminders & overdue alerts" checked={s.notify_reminders} onChange={(v) => save.mutate({ notify_reminders: v })} />
        <Toggle label="New chat messages" checked={s.notify_chat} onChange={(v) => save.mutate({ notify_chat: v })} />
      </Section>

      <Section icon={BellRing} title="Reminder timing">
        <div className="py-4">
          <p className="mb-3 text-sm text-slate-500">
            Remind me before a task is due. Only the nearest reminder is sent, so you won't get several at once. Overdue alerts are sent at most once a day.
          </p>
          <div className="flex flex-wrap gap-2">
            {REMINDER_OPTIONS.map((o) => {
              const on = s.reminder_offsets_minutes.includes(o.minutes);
              return (
                <button
                  key={o.minutes}
                  onClick={() => toggleOffset(o.minutes)}
                  disabled={!s.notify_reminders}
                  className={
                    on
                      ? 'rounded-full bg-brand-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-50'
                      : 'rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50'
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      <Section icon={Monitor} title="Desktop">
        {prefs ? (
          <>
            <Toggle
              label="Start Forays Task App with Windows"
              description="Starts quietly in the system tray so reminders keep working"
              checked={prefs.startWithWindows}
              onChange={(v) => void setPref({ startWithWindows: v })}
            />
            <Toggle
              label="Minimize to system tray when closed"
              description="The close button hides the window; use Exit in the tray menu to quit"
              checked={prefs.minimizeToTray}
              onChange={(v) => void setPref({ minimizeToTray: v })}
            />
          </>
        ) : (
          <p className="py-4 text-sm text-slate-500">Desktop options are available in the installed Windows app.</p>
        )}
      </Section>

      <Section icon={Info} title="About Forays Task App">
        <div className="flex items-center gap-4 py-4">
          <Logo className="h-12 w-12" />
          <div className="text-sm">
            <div className="font-semibold text-navy-900">FORAYS TASK APP</div>
            <div className="text-slate-500">
              Version {info?.version ?? '1.0.0'}
              {info && ` · Electron ${info.electron}`}
            </div>
            <div className="text-slate-500">© {new Date().getFullYear()} Forays Innovations Pvt Ltd</div>
          </div>
        </div>
      </Section>
    </div>
  );
}
