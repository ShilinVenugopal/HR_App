import { useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

export interface MultiSelectOption {
  value: string;
  label: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select...',
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));

  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  const selectedLabels = options.filter((o) => selected.includes(o.value));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input flex min-h-[42px] w-full flex-wrap items-center gap-1 text-left"
      >
        {selectedLabels.length === 0 && <span className="text-slate-400">{placeholder}</span>}
        {selectedLabels.map((o) => (
          <span
            key={o.value}
            className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
          >
            {o.label}
            <X
              size={12}
              className="ml-1 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                toggle(o.value);
              }}
            />
          </span>
        ))}
        <ChevronDown size={16} className="ml-auto shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {options.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No options available</div>}
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="rounded" />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
