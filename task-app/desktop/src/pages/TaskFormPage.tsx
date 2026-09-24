import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth, useMe } from '@/context/AuthContext';
import { createTask, getTask, getTaskAssignments, listActiveUsers, updateTask, type TaskInput } from '@/lib/api';
import { DEFAULT_TZ, PRIORITY_LABEL, todayIn, utcToZonedParts, zonedToUtcIso } from '@/lib/format';
import type { Priority } from '@/lib/types';
import { UserMultiSelect } from '@/components/UserMultiSelect';
import { Button, ErrorBox, Field, PageHeader, PageLoader } from '@/components/ui';

interface FormState {
  title: string;
  description: string;
  assignedDate: string;
  startDate: string;
  dueDate: string;
  dueTime: string;
  priority: Priority;
  assigneeIds: string[];
}

export default function TaskFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const me = useMe();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = me.timezone || DEFAULT_TZ;

  const users = useQuery({ queryKey: ['users', 'active'], queryFn: listActiveUsers });
  const task = useQuery({ queryKey: ['task', id], queryFn: () => getTask(id!), enabled: editing });
  const assignments = useQuery({ queryKey: ['task-assignments', id], queryFn: () => getTaskAssignments(id!), enabled: editing });

  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    assignedDate: todayIn(tz),
    startDate: '',
    dueDate: '',
    dueTime: '17:00',
    priority: 'medium',
    assigneeIds: [],
  });
  const [error, setError] = useState<string | null>(null);

  // Populate the form once when editing.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!editing || loaded || !task.data || !assignments.data) return;
    const t = task.data;
    const due = utcToZonedParts(t.due_at, t.timezone);
    setForm({
      title: t.title,
      description: t.description ?? '',
      assignedDate: t.assigned_date,
      startDate: t.start_date ?? '',
      dueDate: due.date,
      dueTime: due.time,
      priority: t.priority,
      assigneeIds: assignments.data.map((a) => a.user_id),
    });
    setLoaded(true);
  }, [editing, loaded, task.data, assignments.data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const taskTz = task.data?.timezone ?? tz;

  const save = useMutation({
    mutationFn: async () => {
      const input: TaskInput = {
        title: form.title.trim(),
        description: form.description,
        assignedDate: form.assignedDate,
        startDate: form.startDate || null,
        dueAt: zonedToUtcIso(form.dueDate, form.dueTime, taskTz),
        priority: form.priority,
        timezone: taskTz,
        assigneeIds: form.assigneeIds,
      };
      if (editing) {
        await updateTask(id!, input);
        return id!;
      }
      return createTask(input);
    },
    onSuccess: (taskId) => {
      void queryClient.invalidateQueries();
      toast.success(editing ? 'Task updated' : `Task assigned to ${form.assigneeIds.length} ${form.assigneeIds.length === 1 ? 'person' : 'people'}`);
      navigate(`/tasks/${taskId}`, { replace: true });
    },
    onError: (err) => setError((err as Error).message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError('Enter a task title.');
    if (!form.dueDate || !form.dueTime) return setError('Choose a due date and time.');
    if (form.assigneeIds.length === 0) return setError('Assign the task to at least one person.');
    if (form.startDate && form.startDate > form.dueDate) return setError('Start date cannot be after the due date.');
    if (!editing && new Date(zonedToUtcIso(form.dueDate, form.dueTime, taskTz)) < new Date()) {
      if (!window.confirm('The due date/time is in the past, so the task will be overdue immediately. Continue?')) return;
    }
    save.mutate();
  }

  if (editing && (task.isLoading || assignments.isLoading)) return <PageLoader />;
  if (editing && task.data === null) return <ErrorBox error={new Error('Task not found or you do not have access to it.')} />;
  if (editing && task.data && task.data.created_by !== me.id && !isAdmin) {
    return <ErrorBox error={new Error('Only the person who created this task can edit it.')} />;
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl">
      <Link to={editing ? `/tasks/${id}` : '/'} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <PageHeader title={editing ? 'Edit Task' : 'Create Task'} subtitle="Describe the work, set the deadline and choose who should do it." />

      <div className="card space-y-5 p-6">
        <Field label="Task title">
          <input
            className="input text-base"
            placeholder="e.g. Prepare RIL AMC manpower report"
            value={form.title}
            maxLength={200}
            onChange={(e) => set('title', e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Description">
          <textarea
            className="input min-h-[140px] resize-y leading-relaxed"
            placeholder={'e.g. Prepare the manpower report for August and submit it to management.'}
            value={form.description}
            maxLength={10000}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>

        <Field label="Assign to" hint="Pick one or more colleagues. Each person updates their own progress.">
          <UserMultiSelect users={users.data ?? []} value={form.assigneeIds} onChange={(v) => set('assigneeIds', v)} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Assigned date">
            <input type="date" className="input" value={form.assignedDate} disabled={editing} onChange={(e) => set('assignedDate', e.target.value)} />
          </Field>
          <Field label="Start date (optional)">
            <input type="date" className="input" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Due date">
            <input type="date" className="input" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} required />
          </Field>
          <Field label="Due time" hint={`Time zone: ${taskTz}`}>
            <input type="time" className="input" value={form.dueTime} onChange={(e) => set('dueTime', e.target.value)} required />
          </Field>
        </div>

        <Field label="Priority">
          <div className="flex gap-2">
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => set('priority', p)}
                className={
                  form.priority === p
                    ? 'rounded-lg bg-navy-900 px-4 py-1.5 text-sm font-medium text-white'
                    : 'rounded-lg px-4 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                }
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </Field>

        {error && <ErrorBox error={new Error(error)} />}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending} icon={editing ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}>
            {editing ? 'Save changes' : 'Assign task'}
          </Button>
        </div>
      </div>
    </form>
  );
}
