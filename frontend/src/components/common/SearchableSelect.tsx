import { useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

export interface SearchableSelectOption {
  value: string;
  label: string;
  /// Extra text to match against while searching (e.g. code + description
  /// combined) — falls back to `label` when omitted.
  searchText?: string;
}

/// Single-select combobox with an in-panel search box — used wherever a
/// plain <select> would force scrolling through a long, code-heavy list
/// (e.g. Inventory's Cost Code dropdown). Built on the same trigger-button
/// + click-outside-panel mechanics as MultiSelect.tsx, just single-value
/// instead of checkbox-multi.
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  disabled,
}: {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => (o.searchText ?? o.label).toLowerCase().includes(q)) : options;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="input flex w-full items-center justify-between text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} className="ml-2 shrink-0 text-slate-400" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                autoFocus
                className="input py-1.5 pl-7 text-sm"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No matches</div>}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  o.value === value ? 'bg-brand-50 dark:bg-brand-900/20' : ''
                }`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery('');
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
