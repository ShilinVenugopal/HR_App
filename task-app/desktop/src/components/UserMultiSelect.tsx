// Searchable multi-select of active users (the "Assign To" picker).
import clsx from 'clsx';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Profile } from '@/lib/types';
import { Avatar } from './ui';

export function UserMultiSelect({
  users,
  value,
  onChange,
  placeholder = 'Select people…',
}: {
  users: Profile[];
  value: string[];
  onChange(ids: string[]): void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.full_name, u.email, u.designation, u.department].some((f) => f?.toLowerCase().includes(q)),
    );
  }, [users, query]);

  const selected = users.filter((u) => value.includes(u.id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="relative" ref={ref}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}
        className={clsx('input flex min-h-[42px] cursor-text flex-wrap items-center gap-1.5 pr-8', open && 'border-brand-500 ring-2 ring-brand-500/20')}
      >
        {selected.length === 0 && <span className="text-slate-400">{placeholder}</span>}
        {selected.map((u) => (
          <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2 pr-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
            {u.full_name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle(u.id);
              }}
              className="rounded-full p-0.5 hover:bg-brand-100"
              aria-label={`Remove ${u.full_name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
      </div>

      {open && (
        <div className="card absolute z-30 mt-1 w-full animate-fade-in overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, e-mail, designation…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">No matching users</li>}
            {filtered.map((u) => {
              const on = value.includes(u.id);
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => toggle(u.id)}
                    className={clsx('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50', on && 'bg-brand-50/60')}
                  >
                    <span className={clsx('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300')}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <Avatar name={u.full_name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">{u.full_name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {[u.designation, u.email].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            <span>{value.length} selected</span>
            <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
