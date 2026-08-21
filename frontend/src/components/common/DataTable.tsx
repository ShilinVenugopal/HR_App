import { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { PaginationMeta } from '../../types';
import { Skeleton } from './Skeleton';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

/// Windowed page-number list with `null` gap markers, e.g. for page 7 of
/// 20: [1, null, 6, 7, 8, null, 20]. Always includes first, last, and the
/// current page's immediate neighbors.
function pageNumbersWithGaps(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const result: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push(null);
    result.push(p);
  });
  return result;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  meta,
  onPageChange,
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters,
  headerActions,
  emptyLabel = 'No records found',
  rowActions,
  sort,
  onSortChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  showPageNumbers = false,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  meta?: PaginationMeta;
  onPageChange?: (page: number) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  /// Primary action (e.g. "+ Add Candidate") rendered at the right edge of
  /// the search/filter row, so search, filters, and the add button all sit
  /// on one aligned line instead of the button floating in the page header.
  headerActions?: ReactNode;
  emptyLabel?: string;
  rowActions?: (row: T) => ReactNode;
  /// Current sort state and its setter — only meaningful for columns with
  /// `sortable: true`. Omit both to keep a column list purely display-order
  /// (existing pages that don't set `sortable` are unaffected).
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /// Opt-in page-size selector (10/25/50/100 by default) — omit both
  /// `pageSize` and `onPageSizeChange` to keep the plain Prev/Next footer
  /// every existing page already has.
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /// Opt-in numbered page buttons alongside Prev/Next. Existing pages that
  /// don't pass this stay exactly as they are today.
  showPageNumbers?: boolean;
}) {
  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    if (!sort || sort.key !== key) return onSortChange({ key, dir: 'asc' });
    if (sort.dir === 'asc') return onSortChange({ key, dir: 'desc' });
    return onSortChange(null);
  };
  return (
    <div className="card overflow-hidden">
      {(onSearchChange || filters || headerActions) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
          {onSearchChange && (
            <div className="relative w-full max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder={searchPlaceholder}
                value={search ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
          )}
          {filters}
          {headerActions && <div className="ml-auto flex items-center gap-2">{headerActions}</div>}
        </div>
      )}

      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={`whitespace-nowrap px-5 py-3 font-semibold ${col.className ?? ''}`}>
                  {col.sortable && onSortChange ? (
                    <button type="button" onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200">
                      {col.header}
                      {sort?.key === col.key ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp size={12} />
                        ) : (
                          <ArrowDown size={12} />
                        )
                      ) : (
                        <ArrowUpDown size={12} className="text-slate-300 dark:text-slate-600" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
              {rowActions && <th className="whitespace-nowrap px-5 py-3 text-right font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-3.5">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-5 py-3.5">
                      <Skeleton className="h-4 w-16 ml-auto" />
                    </td>
                  )}
                </tr>
              ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)} className="px-5 py-10 text-center text-slate-400">
                  {emptyLabel}
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={`hover:bg-slate-100 dark:hover:bg-slate-800/60 ${
                    i % 2 === 1 ? 'bg-slate-50/60 dark:bg-slate-900/40' : ''
                  }`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-5 py-3.5 ${col.className ?? ''}`}>
                      {col.render(row)}
                    </td>
                  ))}
                  {rowActions && <td className="px-5 py-3.5 text-right">{rowActions(row)}</td>}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {meta && onPageChange && (meta.totalPages > 1 || onPageSizeChange) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-slate-500">
              Page {meta.page} of {meta.totalPages} · {meta.total} records
            </span>
            {onPageSizeChange && (
              <label className="flex items-center gap-1.5 text-slate-500">
                Show
                <select
                  className="input w-auto py-1"
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary px-2 py-1"
              disabled={meta.page <= 1}
              onClick={() => onPageChange(meta.page - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            {showPageNumbers &&
              pageNumbersWithGaps(meta.page, meta.totalPages).map((p, i) =>
                p === null ? (
                  <span key={`gap-${i}`} className="px-1 text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    className={`min-w-[2rem] rounded-md px-2 py-1 ${
                      p === meta.page ? 'bg-brand-600 text-white' : 'btn-secondary'
                    }`}
                    onClick={() => onPageChange(p)}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              className="btn-secondary px-2 py-1"
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPageChange(meta.page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
