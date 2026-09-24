import { format, formatDistanceToNowStrict } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { EffectiveStatus, Priority } from './types';

/** Company default; every task also stores the zone it was created in. */
export const DEFAULT_TZ = 'Asia/Kolkata';

/** Local wall-clock date ("2026-09-18") + time ("17:00") in `tz` -> UTC ISO string. */
export function zonedToUtcIso(date: string, time: string, tz = DEFAULT_TZ): string {
  return fromZonedTime(`${date}T${time || '00:00'}:00`, tz).toISOString();
}

/** UTC instant -> { date: 'yyyy-MM-dd', time: 'HH:mm' } in `tz` (for edit forms). */
export function utcToZonedParts(iso: string, tz = DEFAULT_TZ) {
  return { date: formatInTimeZone(iso, tz, 'yyyy-MM-dd'), time: formatInTimeZone(iso, tz, 'HH:mm') };
}

export const todayIn = (tz = DEFAULT_TZ) => formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');

export const fmtDate = (iso: string | null | undefined, tz = DEFAULT_TZ) =>
  iso ? formatInTimeZone(iso, tz, 'dd MMM yyyy') : '—';
export const fmtTime = (iso: string | null | undefined, tz = DEFAULT_TZ) =>
  iso ? formatInTimeZone(iso, tz, 'h:mm a') : '—';
export const fmtDateTime = (iso: string | null | undefined, tz = DEFAULT_TZ) =>
  iso ? formatInTimeZone(iso, tz, 'dd MMM yyyy, h:mm a') : '—';
/** Plain calendar date ("2026-09-16") -> "16 Sep 2026", without timezone shifts. */
export const fmtPlainDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return format(new Date(y, m - 1, day), 'dd MMM yyyy');
};

export const fromNow = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

/** Chat-list style timestamp: time today, weekday this week, else date. */
export function shortStamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (now.getTime() - d.getTime() < 6 * 86400_000) return format(d, 'EEE');
  return format(d, 'dd MMM');
}

export const taskCode = (n: number) => `FT-${String(n).padStart(5, '0')}`;

export const STATUS_LABEL: Record<EffectiveStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';
