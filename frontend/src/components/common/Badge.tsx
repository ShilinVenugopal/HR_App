const COLOR_MAP: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  PRESENT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  PAID: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  JOINED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  SELECTED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  CLOSED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  DISABLED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  INACTIVE: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  CANCELLED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  DRAFT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  SCREENING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  INTERVIEW_SCHEDULED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  PENDING_RENEWAL: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  ABSENT: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  EXPIRED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  FAILURE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  TERMINATED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export function Badge({ value, label }: { value: string; label?: string }) {
  const classes = COLOR_MAP[value] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`badge ${classes}`}>{label ?? value.replace(/_/g, ' ')}</span>;
}
