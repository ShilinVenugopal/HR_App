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
  RESIGNED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  ON_LEAVE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  BLACKLISTED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  CANCELLED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  DRAFT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  RETURNED: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  SCREENING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  INTERVIEW_SCHEDULED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  PENDING_RENEWAL: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  ABSENT: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  EXPIRED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  FAILURE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  TERMINATED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  BOUNCED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  SENT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  DELIVERED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  WHATSAPP: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  QUEUED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  SENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  EMAIL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  OPENED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  // Billing Status progression: Pending Certification -> A1 Pending ->
  // A2 Pending -> Accounts Pending -> Invoice Done.
  PENDING_CERTIFICATION: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  A1_PENDING: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  A2_PENDING: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  ACCOUNTS_PENDING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  INVOICE_DONE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

export function Badge({ value, label }: { value: string; label?: string }) {
  const classes = COLOR_MAP[value] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`badge ${classes}`}>{label ?? value.replace(/_/g, ' ')}</span>;
}
