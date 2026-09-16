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
    brand: 'bg-gradient-to-br from-brand-600 to-accent-500 shadow-glow',
    emerald: 'bg-gradient-to-br from-emerald-500 to-teal-500 shadow-[0_8px_24px_-6px_rgb(16_185_129/0.4)]',
    amber: 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-[0_8px_24px_-6px_rgb(245_158_11/0.4)]',
    red: 'bg-gradient-to-br from-red-500 to-rose-500 shadow-[0_8px_24px_-6px_rgb(239_68_68/0.4)]',
  }[accent];

  return (
    <div className="card card-hover flex items-center gap-4 p-5">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white ${accentClass}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug text-slate-500 dark:text-slate-400">{label}</p>
        {loading ? <Skeleton className="mt-1.5 h-7 w-16" /> : <p className="text-[26px] font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white">{value}</p>}
      </div>
    </div>
  );
}
