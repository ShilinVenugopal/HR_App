import { LucideIcon } from 'lucide-react';
import { Skeleton } from './Skeleton';

export function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  accent = 'brand',
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  loading?: boolean;
  accent?: 'brand' | 'emerald' | 'amber' | 'red';
}) {
  const accentClass = {
    brand: 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  }[accent];

  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accentClass}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="text-2xl font-semibold">{value}</p>}
      </div>
    </div>
  );
}
