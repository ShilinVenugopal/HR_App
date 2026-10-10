import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, BellRing } from 'lucide-react';
import { BillingItem, billingStatusApi } from '../../api/modules';
import { useProjectOptions } from '../../hooks/useLookups';

function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

function fmtMoney(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
};

const PAYMENT_STATUS_CLASS: Record<string, string> = {
  UNPAID: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const ALL_COLUMNS: { field: string; header: string }[] = [
  { field: 'project', header: 'Project' },
  { field: 'invoiceNo', header: 'Invoice No.' },
  { field: 'invoiceDate', header: 'Invoice Date' },
  { field: 'invoiceAmount', header: 'Invoice Amount' },
  { field: 'amountReceived', header: 'Amount Received' },
  { field: 'outstandingAmount', header: 'Outstanding Amount' },
  { field: 'dueDate', header: 'Due Date' },
  { field: 'paymentStatus', header: 'Payment Status' },
];

/// Dedicated section within Bill Status: invoices that have reached their
/// payment due date and still carry an outstanding balance. Fully hidden
/// (not just empty) when the Super Admin has disabled notifications —
/// disabling never deletes any invoice/payment data, it only suppresses
/// this display per the existing app design.
export function PaymentDueNotifications({ onSelectItem }: { onSelectItem: (item: BillingItem) => void }) {
  const projectOptions = useProjectOptions();
  const [projectId, setProjectId] = useState('');
  const [dueDateFrom, setDueDateFrom] = useState('');
  const [dueDateTo, setDueDateTo] = useState('');

  const filters = { projectId: projectId || undefined, dueDateFrom: dueDateFrom || undefined, dueDateTo: dueDateTo || undefined };

  const { data, isLoading } = useQuery({
    queryKey: ['billing-payment-due', filters],
    queryFn: () => billingStatusApi.paymentDueNotifications(filters),
    // Notification accuracy must survive a refresh/reopen without any extra
    // user action, so this refetches on every mount rather than relying on
    // a stale cache.
    refetchOnMount: 'always',
  });

  const settings = data?.settings;
  if (settings && !settings.enabled) return null;

  const visibleFields = new Set(settings?.visibleFields ?? ALL_COLUMNS.map((c) => c.field));
  const columns = ALL_COLUMNS.filter((c) => visibleFields.has(c.field));
  const rows = data?.items ?? [];

  return (
    <div className="card mb-6 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <BellRing size={16} className="text-amber-500" /> Payment Due Notifications
        </h3>
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto py-1 text-xs" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All Projects</option>
            {projectOptions.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input w-auto py-1 text-xs"
            title="Due Date From"
            value={dueDateFrom}
            onChange={(e) => setDueDateFrom(e.target.value)}
          />
          <input type="date" className="input w-auto py-1 text-xs" title="Due Date To" value={dueDateTo} onChange={(e) => setDueDateTo(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <p className="py-4 text-center text-sm text-slate-400">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
          <AlertCircle size={16} /> No Payment Due
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Sl. No.</th>
                {columns.map((c) => (
                  <th key={c.field} className="px-2 py-1.5">
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                    row.notificationStatus === 'OVERDUE' ? 'bg-red-50/50 dark:bg-red-900/10' : ''
                  }`}
                  onClick={() => onSelectItem(row)}
                >
                  <td className="px-2 py-1.5">{idx + 1}</td>
                  {visibleFields.has('project') && <td className="px-2 py-1.5">{row.billingRecord?.project?.projectName ?? '—'}</td>}
                  {visibleFields.has('invoiceNo') && <td className="px-2 py-1.5 font-mono">{row.invoiceNo ?? '—'}</td>}
                  {visibleFields.has('invoiceDate') && <td className="px-2 py-1.5">{fmtDate(row.invoiceDate)}</td>}
                  {visibleFields.has('invoiceAmount') && <td className="px-2 py-1.5">{fmtMoney(Number(row.totalAmount))}</td>}
                  {visibleFields.has('amountReceived') && <td className="px-2 py-1.5">{fmtMoney(row.totalReceived ?? 0)}</td>}
                  {visibleFields.has('outstandingAmount') && (
                    <td className="px-2 py-1.5 font-semibold text-red-600 dark:text-red-400">{fmtMoney(row.outstandingAmount ?? 0)}</td>
                  )}
                  {visibleFields.has('dueDate') && <td className="px-2 py-1.5">{fmtDate(row.dueDate)}</td>}
                  {visibleFields.has('paymentStatus') && (
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={`badge ${PAYMENT_STATUS_CLASS[row.paymentStatus ?? 'UNPAID']}`}>
                          {PAYMENT_STATUS_LABEL[row.paymentStatus ?? 'UNPAID'] ?? row.paymentStatus}
                        </span>
                        {row.notificationStatus === 'OVERDUE' && (
                          <span className="badge bg-red-600 text-white dark:bg-red-700">Overdue</span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
