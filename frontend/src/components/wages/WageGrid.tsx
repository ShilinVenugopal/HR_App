import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Clock, Loader2, Trash2, X } from 'lucide-react';
import { WageColumnDef, WageEntry } from '../../api/modules';

export interface WageSort {
  key: string;
  dir: 'asc' | 'desc';
}

type CellValue = string | number | null;
type RowValues = Record<string, CellValue>;

function formatCell(col: WageColumnDef, value: CellValue): string {
  if (value === null || value === undefined || value === '') return col.formula ? '0' : '';
  if (col.type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(value);
  }
  return String(value);
}

function sectionSpans(columns: WageColumnDef[]): { section: string; span: number }[] {
  const spans: { section: string; span: number }[] = [];
  for (const col of columns) {
    const last = spans[spans.length - 1];
    if (last && last.section === col.section) last.span += 1;
    else spans.push({ section: col.section, span: 1 });
  }
  return spans;
}

function EditableCell({ col, value, canEdit, onCommit }: { col: WageColumnDef; value: CellValue; canEdit: boolean; onCommit: (value: CellValue) => void }) {
  const [local, setLocal] = useState(value ?? '');

  useEffect(() => {
    setLocal(value ?? '');
  }, [value]);

  if (col.formula) {
    return <span className="tabular-nums text-slate-400">{formatCell(col, value)}</span>;
  }

  if (!canEdit) {
    return <span className="px-1.5">{formatCell(col, value)}</span>;
  }

  return (
    <input
      type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== (value ?? '')) onCommit(local === '' ? null : col.type === 'number' ? Number(local) : local);
      }}
      className="w-full min-w-[6rem] rounded border border-transparent bg-transparent px-1.5 py-1 text-sm focus:border-brand-400 focus:bg-white focus:outline-none dark:focus:bg-slate-900"
    />
  );
}

export function WageGrid({
  columns,
  entries,
  savingRowId,
  canEdit,
  canDelete,
  sort,
  onSortChange,
  onSaveCell,
  onDeleteRow,
  onOpenHistory,
  newRowDraft,
  onNewRowChange,
  onSaveNewRow,
  onCancelNewRow,
  savingNewRow,
}: {
  columns: WageColumnDef[];
  entries: WageEntry[];
  savingRowId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  sort: WageSort | null;
  onSortChange: (sort: WageSort | null) => void;
  onSaveCell: (entry: WageEntry, key: string, value: CellValue) => void;
  onDeleteRow: (entry: WageEntry) => void;
  onOpenHistory: (employeeCode: string, employeeName: string) => void;
  newRowDraft: RowValues | null;
  onNewRowChange: (values: RowValues) => void;
  onSaveNewRow: () => void;
  onCancelNewRow: () => void;
  savingNewRow: boolean;
}) {
  const spans = sectionSpans(columns);

  const toggleSort = (key: string) => {
    if (!sort || sort.key !== key) return onSortChange({ key, dir: 'asc' });
    if (sort.dir === 'asc') return onSortChange({ key, dir: 'desc' });
    return onSortChange(null);
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
          <tr>
            <th rowSpan={2} className="sticky left-0 z-20 min-w-[3rem] border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800">
              Sr.
            </th>
            {spans.map((s, i) => (
              <th key={i} colSpan={s.span} className="border-b border-l border-slate-200 px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800">
                {s.section}
              </th>
            ))}
            <th rowSpan={2} className="min-w-[5rem] border-b border-l border-slate-200 px-2 py-2 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800">
              Actions
            </th>
          </tr>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="min-w-[7rem] whitespace-pre-line border-b border-l border-slate-200 px-2 py-2 text-left text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
                <button
                  type="button"
                  onClick={() => toggleSort(c.key)}
                  className="flex items-center gap-1 text-left hover:text-brand-600"
                  title="Sort"
                >
                  <span>
                    {c.label}
                    {c.required && <span className="text-red-500"> *</span>}
                  </span>
                  {sort?.key === c.key ? (
                    sort.dir === 'asc' ? (
                      <ArrowUp size={11} />
                    ) : (
                      <ArrowDown size={11} />
                    )
                  ) : (
                    <ArrowUpDown size={11} className="text-slate-300" />
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {newRowDraft && (
            <tr className="bg-brand-50/60 dark:bg-brand-900/10">
              <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-brand-50/60 px-2 py-1.5 text-slate-400 dark:border-slate-800 dark:bg-brand-900/10">
                new
              </td>
              {columns.map((c) => (
                <td key={c.key} className="border-b border-l border-slate-100 px-1 py-1 dark:border-slate-800/60">
                  {c.formula ? (
                    <span className="px-1.5 text-slate-400">0</span>
                  ) : (
                    <input
                      type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                      value={(newRowDraft[c.key] as string | number) ?? ''}
                      onChange={(e) => onNewRowChange({ ...newRowDraft, [c.key]: e.target.value === '' ? null : c.type === 'number' ? Number(e.target.value) : e.target.value })}
                      className="w-full min-w-[6rem] rounded border border-slate-300 bg-white px-1.5 py-1 text-sm focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                    />
                  )}
                </td>
              ))}
              <td className="border-b border-l border-slate-100 px-2 py-1.5 dark:border-slate-800/60">
                <div className="flex items-center gap-1">
                  <button disabled={savingNewRow} onClick={onSaveNewRow} className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" title="Save">
                    {savingNewRow ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button onClick={onCancelNewRow} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Cancel">
                    <X size={14} />
                  </button>
                </div>
              </td>
            </tr>
          )}
          {entries.map((entry, idx) => {
            const idCol = columns.find((c) => c.isEmployeeId);
            const nameCol = columns.find((c) => c.isEmployeeName);
            return (
              <tr key={entry.id} className="odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900 dark:even:bg-slate-800/30">
                <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-inherit px-2 py-1.5 text-slate-500 dark:border-slate-800">{idx + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} className="border-b border-l border-slate-100 px-1 py-1 dark:border-slate-800/60">
                    <EditableCell col={c} value={entry.data[c.key] ?? null} canEdit={canEdit} onCommit={(v) => onSaveCell(entry, c.key, v)} />
                  </td>
                ))}
                <td className="border-b border-l border-slate-100 px-2 py-1.5 dark:border-slate-800/60">
                  <div className="flex items-center gap-1">
                    {savingRowId === entry.id && <Loader2 size={13} className="animate-spin text-brand-500" />}
                    <button
                      onClick={() => onOpenHistory(idCol ? String(entry.data[idCol.key] ?? entry.employeeCode) : entry.employeeCode, nameCol ? String(entry.data[nameCol.key] ?? entry.employeeName) : entry.employeeName)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                      title="Employee Wage History"
                    >
                      <Clock size={14} />
                    </button>
                    {canDelete && (
                      <button onClick={() => onDeleteRow(entry)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {!entries.length && !newRowDraft && (
            <tr>
              <td colSpan={columns.length + 2} className="px-4 py-10 text-center text-sm text-slate-400">
                No wage records for this month yet — upload a filled template or add a row manually.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
