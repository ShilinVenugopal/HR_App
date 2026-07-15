import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { PaginationMeta } from '../../types';
import { Skeleton } from './Skeleton';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  meta,
  onPageChange,
  search,
  onSearchChange,
  filters,
  emptyLabel = 'No records found',
  rowActions,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  meta?: PaginationMeta;
  onPageChange?: (page: number) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  filters?: ReactNode;
  emptyLabel?: string;
  rowActions?: (row: T) => ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      {(onSearchChange || filters) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
          {onSearchChange && (
            <div className="relative w-full max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="Search..."
                value={search ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
          )}
          {filters}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-3 font-semibold ${col.className ?? ''}`}>
                  {col.header}
                </th>
              ))}
              {rowActions && <th className="px-4 py-3 text-right font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-16 ml-auto" />
                    </td>
                  )}
                </tr>
              ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)} className="px-4 py-10 text-center text-slate-400">
                  {emptyLabel}
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                      {col.render(row)}
                    </td>
                  ))}
                  {rowActions && <td className="px-4 py-3 text-right">{rowActions(row)}</td>}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {meta && onPageChange && meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
          <span className="text-slate-500">
            Page {meta.page} of {meta.totalPages} · {meta.total} records
          </span>
          <div className="flex gap-2">
            <button
              className="btn-secondary px-2 py-1"
              disabled={meta.page <= 1}
              onClick={() => onPageChange(meta.page - 1)}
            >
              <ChevronLeft size={16} />
            </button>
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
