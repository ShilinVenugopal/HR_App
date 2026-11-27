import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, RotateCcw, Search } from 'lucide-react';
import {
  SUBCONTRACTOR_BILL_STATUS_OPTIONS,
  SubcontractorBill,
  subcontractorPaymentsApi,
} from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { StatCard } from '../components/common/StatCard';
import { useAuth } from '../context/AuthContext';
import { useProjectOptions, useSubcontractorOptions } from '../hooks/useLookups';
import { formatRupees } from '../utils/subcontractorCalc';
import { BillDetailModal } from '../components/subcontractorPayments/BillDetailModal';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const BILL_STATUS_CLASS: Record<string, string> = {
  PENDING: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  PAID: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

interface Filters {
  projectId: string;
  subcontractorId: string;
  billingMonth: string;
  billingYear: string;
}

const EMPTY_FILTERS: Filters = { projectId: '', subcontractorId: '', billingMonth: '', billingYear: '' };

export default function SubcontractorPaymentDue() {
  const { can } = useAuth();
  const projectOptions = useProjectOptions();
  const subcontractorOptions = useSubcontractorOptions();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [viewBill, setViewBill] = useState<SubcontractorBill | null>(null);

  const queryParams = {
    projectId: appliedFilters.projectId || undefined,
    subcontractorId: appliedFilters.subcontractorId || undefined,
    billingMonth: appliedFilters.billingMonth ? Number(appliedFilters.billingMonth) : undefined,
    billingYear: appliedFilters.billingYear ? Number(appliedFilters.billingYear) : undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['subcontractor-payment-due', page, pageSize, queryParams],
    queryFn: () => subcontractorPaymentsApi.paymentDue({ page, pageSize, ...queryParams }),
    // Due status must reflect the current date on every visit, not a stale cache.
    refetchOnMount: 'always',
  });

  const handleSearch = () => {
    setAppliedFilters(filters);
    setPage(1);
  };
  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const rows = data?.data ?? [];
  const totalOutstanding = data?.meta?.totalOutstanding ?? 0;

  const columns: Column<SubcontractorBill>[] = [
    { key: 'subcontractor', header: 'Subcontractor', render: (r) => <span className="font-medium">{r.subcontractor?.companyName ?? '—'}</span> },
    { key: 'project', header: 'Project Number', render: (r) => r.project?.projectNumber ?? r.project?.projectName ?? '—' },
    { key: 'billingMonth', header: 'Billing Month', render: (r) => `${MONTHS[r.billingMonth - 1]} ${r.billingYear}` },
    { key: 'invoiceNumber', header: 'Invoice No.', render: (r) => r.invoiceNumber },
    { key: 'invoiceDate', header: 'Invoice Date', render: (r) => new Date(r.invoiceDate).toLocaleDateString() },
    { key: 'dueDate', header: 'Due Date', render: (r) => (r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—') },
    { key: 'netPayableAmount', header: 'Original Net Payable', render: (r) => formatRupees(r.netPayableAmount) },
    { key: 'totalPaidAmount', header: 'Total Amount Paid', render: (r) => formatRupees(r.totalPaidAmount ?? 0) },
    {
      key: 'outstandingAmount',
      header: 'Outstanding Amount',
      render: (r) => <span className="font-semibold text-red-600 dark:text-red-400">{formatRupees(r.outstandingAmount ?? 0)}</span>,
    },
    {
      key: 'paymentStatus',
      header: 'Payment Status',
      render: (r) => (
        <span className={`badge ${BILL_STATUS_CLASS[r.paymentStatus ?? 'PENDING']}`}>
          {SUBCONTRACTOR_BILL_STATUS_OPTIONS.find((s) => s.value === r.paymentStatus)?.label ?? r.paymentStatus}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Subcontractor Payment Due"
        description="Invoices that have crossed 30 days from their invoice date and still carry an outstanding balance — sorted oldest due date first"
      />

      <div className="card mb-6 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Billing Month</label>
            <select className="input" value={filters.billingMonth} onChange={(e) => setFilters((f) => ({ ...f, billingMonth: e.target.value }))}>
              <option value="">All Months</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Billing Year</label>
            <input type="number" className="input" placeholder="e.g. 2026" value={filters.billingYear} onChange={(e) => setFilters((f) => ({ ...f, billingYear: e.target.value }))} />
          </div>
          <div>
            <label className="label">Project Number</label>
            <select className="input" value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">All Projects</option>
              {projectOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Subcontractor</label>
            <select className="input" value={filters.subcontractorId} onChange={(e) => setFilters((f) => ({ ...f, subcontractorId: e.target.value }))}>
              <option value="">All Subcontractors</option>
              {subcontractorOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={handleSearch}>
            <Search size={16} /> Search
          </button>
          <button className="btn-secondary" onClick={handleReset}>
            <RotateCcw size={16} /> Clear Filters
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Invoices Due" value={data?.meta?.total ?? 0} icon={AlertTriangle} accent="amber" />
        <StatCard label="Total Outstanding (Filtered)" value={formatRupees(totalOutstanding)} icon={AlertTriangle} accent="red" />
      </div>

      <div className="mb-3 flex items-center justify-end gap-2 text-sm">
        <label className="text-slate-500 dark:text-slate-400">Rows per page:</label>
        <select
          className="input w-auto py-1"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {!isLoading && rows.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <AlertCircle size={20} /> No Payment Due
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          loading={isLoading}
          meta={data?.meta}
          onPageChange={setPage}
          rowActions={(row) => (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setViewBill(row)}>
              {can('SUBCONTRACTORS', 'edit') ? 'Edit' : 'View'}
            </button>
          )}
        />
      )}

      <BillDetailModal bill={viewBill} onClose={() => setViewBill(null)} readOnly={!can('SUBCONTRACTORS', 'edit')} />
    </div>
  );
}
