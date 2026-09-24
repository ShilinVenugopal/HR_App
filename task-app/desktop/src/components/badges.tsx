import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, XCircle } from 'lucide-react';
import { PRIORITY_LABEL, STATUS_LABEL } from '@/lib/format';
import type { EffectiveStatus, Priority } from '@/lib/types';

const STATUS_STYLE: Record<EffectiveStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  in_progress: 'bg-brand-50 text-brand-700 ring-brand-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  overdue: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const STATUS_ICON: Record<EffectiveStatus, typeof Clock3> = {
  pending: CircleDashed,
  in_progress: Clock3,
  completed: CheckCircle2,
  overdue: AlertTriangle,
  cancelled: XCircle,
};

export function StatusBadge({ status }: { status: EffectiveStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS_STYLE[status])}>
      <Icon className="h-3 w-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  low: 'text-slate-500',
  medium: 'text-sky-600',
  high: 'text-orange-600',
  urgent: 'text-rose-600',
};
const PRIORITY_DOT: Record<Priority, string> = {
  low: 'bg-slate-400',
  medium: 'bg-sky-500',
  high: 'bg-orange-500',
  urgent: 'bg-rose-500',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium', PRIORITY_STYLE[priority])}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[priority])} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
