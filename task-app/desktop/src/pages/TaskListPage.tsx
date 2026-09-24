import clsx from 'clsx';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ClipboardList, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMe } from '@/context/AuthContext';
import { listMyAssignments, listTasks, PAGE_SIZE, type TaskFilters } from '@/lib/api';
import { fmtDate, fmtTime, PRIORITY_LABEL, STATUS_LABEL, taskCode } from '@/lib/format';
import type { AssignmentRow, EffectiveStatus, Priority, TaskRow } from '@/lib/types';
import { PriorityBadge, StatusBadge } from '@/components/badges';
import { Button, EmptyState, ErrorBox, PageHeader, ProgressBar, Skeleton } from '@/components/ui';

type Mode = 'mine' | 'assigned' | 'all';

const TITLES: Record<Mode, { title: string; subtitle: string }> = {
  mine: { title: 'My Tasks', subtitle: 'Tasks assigned to you. Update progress and mark them complete.' },
  assigned: { title: 'Assigned by Me', subtitle: 'Tasks you created, with every assignee’s progress.' },
  all: { title: 'All Tasks', subtitle: 'System-wide task overview (Admin).' },
};

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function TaskListPage({ mode }: { mode: Mode }) {
  const me = useMe();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const status = (params.get('status') ?? '') as EffectiveStatus | '';
  const [priority, setPriority] = useState<Priority | ''>('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [sort, setSort] = useState({ column: 'due_at', ascending: true });
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [debounced, status, priority, dueFrom, dueTo, sort, mode]);

  const filters: TaskFilters = { search: debounced, status, priority, dueFrom, dueTo, sort, page };
  const query = useQuery<{ rows: (AssignmentRow | TaskRow)[]; count: number }>({
    queryKey: mode === 'mine' ? ['my-assignments', filters] : ['tasks', mode, filters],
    queryFn: () => (mode === 'mine' ? listMyAssignments(me.id, filters) : listTasks(me.id, mode === 'all' ? 'all' : 'created', filters)),
    placeholderData: keepPreviousData,
  });

  const columns: Column[] = useMemo(
    () => [
      { key: 'title', label: 'Task', sortable: true },
      mode === 'mine'
        ? { key: 'created_by_name', label: 'Assigned By', sortable: true }
        : { key: 'assignee_names', label: 'Assigned To', sortable: true },
      ...(mode === 'all' ? [{ key: 'created_by_name', label: 'Assigned By', sortable: true }] : []),
      { key: 'due_at', label: 'Due', sortable: true },
      { key: 'priority', label: 'Priority', sortable: true },
      { key: mode === 'mine' ? 'progress' : 'avg_progress', label: 'Progress', sortable: true, className: 'w-36' },
      { key: 'effective_status', label: 'Status', sortable: true },
    ],
    [mode],
  );

  const setStatus = (s: string) => {
    const next = new URLSearchParams(params);
    if (s) next.set('status', s);
    else next.delete('status');
    setParams(next, { replace: true });
  };

  const total = query.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(search || status || priority || dueFrom || dueTo);

  return (
    <>
      <PageHeader
        title={TITLES[mode].title}
        subtitle={TITLES[mode].subtitle}
        actions={
          <Link to="/tasks/new">
            <Button icon={<Plus className="h-4 w-4" />}>Create Task</Button>
          </Link>
        }
      />

      {/* status quick filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['', 'pending', 'in_progress', 'overdue', 'completed', 'cancelled'] as const).map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-medium transition',
              status === s ? 'bg-navy-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100',
            )}
          >
            {s ? STATUS_LABEL[s] : 'All'}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search tasks or people…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-36" value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}>
            <option value="">All priorities</option>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Due from
            <input type="date" className="input w-36" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            to
            <input type="date" className="input w-36" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
          </label>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={() => {
                setSearch('');
                setStatus('');
                setPriority('');
                setDueFrom('');
                setDueTo('');
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {query.error ? (
          <div className="p-4">
            <ErrorBox error={query.error} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-500">
                  {columns.map((c) => (
                    <th key={c.key} className={clsx('px-4 py-3 font-semibold', c.className)}>
                      {c.sortable ? (
                        <button
                          className="inline-flex items-center gap-1 hover:text-slate-800"
                          onClick={() => setSort((s) => ({ column: c.key, ascending: s.column === c.key ? !s.ascending : true }))}
                        >
                          {c.label}
                          {sort.column === c.key && (sort.ascending ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {query.isLoading &&
                  [0, 1, 2, 3, 4].map((i) => (
                    <tr key={i}>
                      <td colSpan={columns.length} className="px-4 py-3">
                        <Skeleton className="h-8" />
                      </td>
                    </tr>
                  ))}
                {query.data?.rows.map((row) => {
                  const r = row as AssignmentRow & TaskRow;
                  const taskId = mode === 'mine' ? r.task_id : r.id;
                  const progress = mode === 'mine' ? r.progress : r.avg_progress;
                  return (
                    <tr
                      key={mode === 'mine' ? r.assignment_id : r.id}
                      onClick={() => navigate(`/tasks/${taskId}`)}
                      className={clsx('cursor-pointer transition hover:bg-brand-50/40', r.effective_status === 'overdue' && 'bg-rose-50/40')}
                    >
                      <td className="max-w-[320px] px-4 py-3">
                        <div className="text-[11px] font-medium text-slate-400">{taskCode(r.task_no)}</div>
                        <div className="truncate font-medium text-slate-800">{r.title}</div>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-slate-600">
                        {mode === 'mine' ? r.created_by_name : r.assignee_names || '—'}
                        {mode !== 'mine' && r.assignee_count > 1 && (
                          <span className="ml-1 text-xs text-slate-400">
                            ({r.completed_count}/{r.assignee_count} done)
                          </span>
                        )}
                      </td>
                      {mode === 'all' && <td className="px-4 py-3 text-slate-600">{r.created_by_name}</td>}
                      <td className={clsx('whitespace-nowrap px-4 py-3', r.effective_status === 'overdue' ? 'font-medium text-rose-600' : 'text-slate-600')}>
                        <div>{fmtDate(r.due_at, r.timezone)}</div>
                        <div className="text-xs opacity-80">{fmtTime(r.due_at, r.timezone)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge priority={r.priority} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={progress} />
                          <span className="w-9 text-right text-xs tabular-nums text-slate-500">{progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.effective_status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!query.isLoading && query.data?.rows.length === 0 && (
              <EmptyState
                icon={<ClipboardList className="h-5 w-5" />}
                title={hasFilters ? 'No tasks match these filters' : 'No tasks yet'}
                text={mode === 'mine' ? 'Tasks assigned to you will appear here.' : 'Create a task to get started.'}
              />
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span>
            {total} task{total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="h-3.5 w-3.5" />}>
              Prev
            </Button>
            <span>
              Page {page + 1} of {pages}
            </span>
            <Button variant="secondary" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
