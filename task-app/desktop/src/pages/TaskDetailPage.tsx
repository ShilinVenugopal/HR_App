import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CalendarDays, CheckCircle2, Clock, History, Pencil, User, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth, useMe } from '@/context/AuthContext';
import { cancelTask, getTask, getTaskActivity, getTaskAssignments, updateProgress } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtPlainDate, fmtTime, STATUS_LABEL, taskCode } from '@/lib/format';
import type { AssignmentRow, AssignmentStatus, TaskActivity } from '@/lib/types';
import { PriorityBadge, StatusBadge } from '@/components/badges';
import { Avatar, Button, ErrorBox, Field, Modal, PageLoader, ProgressBar } from '@/components/ui';

function describeActivity(a: TaskActivity) {
  const pretty = (s: string | null) => (s ? STATUS_LABEL[s as AssignmentStatus] ?? s : '');
  switch (a.action) {
    case 'created':
      return 'created the task';
    case 'assigned':
      return `assigned it to ${a.new_value}`;
    case 'unassigned':
      return `removed ${a.old_value} from the task`;
    case 'status_changed':
      return `changed status from ${pretty(a.old_value)} to ${pretty(a.new_value)}`;
    case 'progress_updated':
      return `updated progress from ${a.old_value} to ${a.new_value}`;
    case 'remarks_updated':
      return `added remarks: “${a.new_value}”`;
    case 'completed':
      return a.new_value ? `completed the task — “${a.new_value}”` : 'completed the task';
    case 'title_changed':
      return `renamed the task to “${a.new_value}”`;
    case 'description_changed':
      return 'updated the description';
    case 'priority_changed':
      return `changed priority from ${a.old_value} to ${a.new_value}`;
    case 'due_changed':
      return `moved the deadline from ${a.old_value} to ${a.new_value}`;
    case 'cancelled':
      return a.new_value ? `cancelled the task — “${a.new_value}”` : 'cancelled the task';
    default:
      return a.action.replace(/_/g, ' ');
  }
}

function MyProgressCard({ assignment }: { assignment: AssignmentRow }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AssignmentStatus>(assignment.status);
  const [progress, setProgress] = useState(assignment.progress);
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    setStatus(assignment.status);
    setProgress(assignment.progress);
  }, [assignment.status, assignment.progress]);

  const save = useMutation({
    mutationFn: (s: AssignmentStatus) => updateProgress(assignment.assignment_id, s, s === 'completed' ? 100 : progress, remarks),
    onSuccess: (_d, s) => {
      setRemarks('');
      void queryClient.invalidateQueries();
      toast.success(s === 'completed' ? 'Task marked as completed' : 'Progress updated');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const locked = assignment.effective_status === 'cancelled';
  const done = assignment.status === 'completed';

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-r from-brand-50 to-accent-300/10 px-5 py-3">
        <h3 className="font-semibold text-navy-900">My progress</h3>
      </div>
      <div className="space-y-4 p-5">
        {locked ? (
          <p className="text-sm text-slate-500">This task was cancelled by its creator.</p>
        ) : done ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
            <div className="flex-1">
              <div className="font-medium text-emerald-700">You completed this task</div>
              <div className="text-xs text-slate-500">{fmtDateTime(assignment.completed_at)}</div>
              {assignment.completion_remarks && <p className="mt-1 text-sm text-slate-600">“{assignment.completion_remarks}”</p>}
            </div>
            <Button variant="secondary" size="sm" loading={save.isPending} onClick={() => save.mutate('in_progress')}>
              Reopen
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status">
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value as AssignmentStatus)}>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </Field>
              <Field label={`Progress — ${status === 'completed' ? 100 : progress}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={status === 'completed' ? 100 : progress}
                  disabled={status === 'completed'}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="mt-3 w-full accent-brand-500"
                />
              </Field>
            </div>
            <Field label={status === 'completed' ? 'Completion remarks (optional)' : 'Remarks — what is done, what is pending'}>
              <textarea
                className="input min-h-[80px]"
                placeholder={status === 'completed' ? 'e.g. Report submitted to management.' : 'e.g. Manpower data completed. Billing data pending.'}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                maxLength={4000}
              />
            </Field>
            {assignment.remarks && (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Last remarks: <span className="text-slate-700">“{assignment.remarks}”</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="success" loading={save.isPending && status === 'completed'} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => save.mutate('completed')}>
                Mark completed
              </Button>
              <Button loading={save.isPending && status !== 'completed'} disabled={status === 'completed'} onClick={() => save.mutate(status)}>
                Update progress
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function TaskDetailPage() {
  const { id } = useParams();
  const me = useMe();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const task = useQuery({ queryKey: ['task', id], queryFn: () => getTask(id!) });
  const assignments = useQuery({ queryKey: ['task-assignments', id], queryFn: () => getTaskAssignments(id!) });
  const activity = useQuery({ queryKey: ['task-activity', id], queryFn: () => getTaskActivity(id!) });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const cancel = useMutation({
    mutationFn: () => cancelTask(id!, reason),
    onSuccess: () => {
      setCancelOpen(false);
      void queryClient.invalidateQueries();
      toast.success('Task cancelled');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (task.isLoading) return <PageLoader />;
  if (task.error) return <ErrorBox error={task.error} />;
  if (!task.data) return <ErrorBox error={new Error('Task not found, or you do not have access to it.')} />;

  const t = task.data;
  const mine = assignments.data?.find((a) => a.user_id === me.id);
  const canManage = (t.created_by === me.id || isAdmin) && t.status !== 'cancelled';

  return (
    <>
      <button onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-3">
            <span className="rounded-md bg-navy-900 px-2 py-0.5 text-[11px] font-semibold tracking-wider text-accent-300">{taskCode(t.task_no)}</span>
            <StatusBadge status={t.effective_status} />
            <PriorityBadge priority={t.priority} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{t.title}</h1>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Link to={`/tasks/${t.id}/edit`}>
              <Button variant="secondary" icon={<Pencil className="h-4 w-4" />}>
                Edit
              </Button>
            </Link>
            <Button variant="secondary" className="text-rose-600" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>
              Cancel task
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Description</h3>
            {t.description ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{t.description}</p>
            ) : (
              <p className="text-sm italic text-slate-400">No description.</p>
            )}
          </section>

          {mine && <MyProgressCard assignment={mine} />}

          <section className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="flex items-center gap-2 font-semibold text-navy-900">
                <Users className="h-4 w-4 text-brand-500" /> Assigned to
              </h3>
              <span className="text-xs text-slate-500">
                {t.completed_count}/{t.assignee_count} completed · {t.avg_progress}% overall
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {assignments.data?.map((a) => (
                <li key={a.assignment_id} className={clsx('px-5 py-4', a.user_id === me.id && 'bg-brand-50/30')}>
                  <div className="flex items-center gap-3">
                    <Avatar name={a.assignee_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800">
                        {a.assignee_name}
                        {a.user_id === me.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                      </div>
                      <div className="text-xs text-slate-500">Updated {fmtDateTime(a.updated_at)}</div>
                    </div>
                    <div className="w-32">
                      <ProgressBar value={a.progress} />
                      <div className="mt-1 text-right text-[11px] tabular-nums text-slate-500">{a.progress}%</div>
                    </div>
                    <StatusBadge status={a.effective_status} />
                  </div>
                  {(a.remarks || a.completion_remarks) && (
                    <p className="ml-10 mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      {a.completion_remarks ? `✓ ${a.completion_remarks}` : a.remarks}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card divide-y divide-slate-100 text-sm">
            {[
              { icon: User, label: 'Assigned by', value: t.created_by_name },
              { icon: CalendarDays, label: 'Assigned date', value: fmtPlainDate(t.assigned_date) },
              ...(t.start_date ? [{ icon: CalendarDays, label: 'Start date', value: fmtPlainDate(t.start_date) }] : []),
              { icon: CalendarDays, label: 'Due date', value: fmtDate(t.due_at, t.timezone), danger: t.effective_status === 'overdue' },
              { icon: Clock, label: 'Due time', value: `${fmtTime(t.due_at, t.timezone)}`, danger: t.effective_status === 'overdue' },
              ...(t.completed_at ? [{ icon: CheckCircle2, label: 'Completed', value: fmtDateTime(t.completed_at) }] : []),
            ].map(({ icon: Icon, label, value, danger }) => (
              <div key={label} className="flex items-center justify-between px-5 py-3">
                <span className="flex items-center gap-2 text-slate-500">
                  <Icon className="h-4 w-4" /> {label}
                </span>
                <span className={clsx('font-medium', danger ? 'text-rose-600' : 'text-slate-800')}>{value}</span>
              </div>
            ))}
            <div className="px-5 py-2 text-[11px] text-slate-400">Time zone: {t.timezone}</div>
          </section>

          <section className="card">
            <h3 className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 font-semibold text-navy-900">
              <History className="h-4 w-4 text-brand-500" /> Activity history
            </h3>
            <ol className="relative space-y-4 px-5 py-4">
              {activity.data?.map((a, i) => (
                <li key={a.id} className="relative pl-6">
                  {i < (activity.data?.length ?? 0) - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-slate-200" />}
                  <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-brand-500 bg-white" />
                  <div className="text-xs text-slate-400">{fmtDateTime(a.created_at)}</div>
                  <div className="text-sm text-slate-700">
                    <span className="font-medium">{a.actor?.full_name ?? 'System'}</span> {describeActivity(a)}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <Modal
        open={cancelOpen}
        title="Cancel this task?"
        onClose={() => setCancelOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep task
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel task
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">Assignees will be notified. The task and its history are kept for reference.</p>
        <Field label="Reason (optional)">
          <textarea className="input min-h-[70px]" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
