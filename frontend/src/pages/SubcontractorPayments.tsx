import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, FileText, IndianRupee, Plus, RotateCcw, Search, Trash2, Wallet } from 'lucide-react';
import {
  SUBCONTRACTOR_BILL_STATUS_OPTIONS,
  SubcontractorBill,
  SubcontractorBillPaymentStatus,
  subcontractorPaymentsApi,
} from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column, SortState } from '../components/common/DataTable';
import { StatCard } from '../components/common/StatCard';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useProjectOptions, useSubcontractorOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';
import { formatRupees } from '../utils/subcontractorCalc';
import { AddBillModal } from '../components/subcontractorPayments/AddBillModal';
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
  invoiceNumber: string;
  paymentStatus: string;
}

const EMPTY_FILTERS: Filters = {
  projectId: '',
  subcontractorId: '',
  billingMonth: '',
  billingYear: '',
  invoiceNumber: '',
  paymentStatus: '',
};

export default function SubcontractorPayments() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();
  const subcontractorOptions = useSubcontractorOptions();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<SortState | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [viewBill, setViewBill] = useState<SubcontractorBill | null>(null);
  const [deleteBill, setDeleteBill] = useState<SubcontractorBill | null>(null);

  // Default view shows ALL bills — no month/project selection is required
  // before anything appears (req. #6).
  const queryParams = {
    projectId: appliedFilters.projectId || undefined,
    subcontractorId: appliedFilters.subcontractorId || undefined,
    billingMonth: appliedFilters.billingMonth ? Number(appliedFilters.billingMonth) : undefined,
    billingYear: appliedFilters.billingYear ? Number(appliedFilters.billingYear) : undefined,
    invoiceNumber: appliedFilters.invoiceNumber || undefined,
    paymentStatus: (appliedFilters.paymentStatus || undefined) as SubcontractorBillPaymentStatus | undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['subcontractor-bills', page, pageSize, queryParams, sort],
    queryFn: () =>
      subcontractorPaymentsApi.list({
        page,
        pageSize,
        ...queryParams,
        ...(sort ? { sortBy: sort.key, sortOrder: sort.dir } : {}),
      }),
  });

  const { data: totals } = useQuery({
    queryKey: ['subcontractor-bill-totals', queryParams],
    queryFn: () => subcontractorPaymentsApi.totals(queryParams),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => subcontractorPaymentsApi.remove(id),
    onSuccess: () => {
      toast.success('Subcontractor bill deleted');
      setDeleteBill(null);
      queryClient.invalidateQueries({ queryKey: ['subcontractor-bills'] });
      queryClient.invalidateQueries({ queryKey: ['subcontractor-bill-totals'] });
      queryClient.invalidateQueries({ queryKey: ['subcontractor-payment-due'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
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

  const columns: Column<SubcontractorBill>[] = [
    { key: 'subcontractor', header: 'Subcontractor', render: (r) => <span className="font-medium">{r.subcontractor?.companyName ?? '—'}</span> },
    { key: 'project', header: 'Project Number', render: (r) => r.project?.projectNumber ?? r.project?.projectName ?? '—' },
    { key: 'billingMonth', header: 'Billing Month', render: (r) => `${MONTHS[r.billingMonth - 1]} ${r.billingYear}` },
    { key: 'invoiceNumber', header: 'Invoice No.', sortable: true, render: (r) => r.invoiceNumber },
    { key: 'invoiceDate', header: 'Invoice Date', sortable: true, render: (r) => new Date(r.invoiceDate).toLocaleDateString() },
    { key: 'foraysWoNumber', header: 'Forays WO No.', render: (r) => r.foraysWoNumber ?? '—' },
    { key: 'basicAmount', header: 'Basic Amount', sortable: true, render: (r) => formatRupees(r.basicAmount) },
    { key: 'additionalAmount', header: 'Additional Amount', render: (r) => formatRupees(r.additionalAmount) },
    { key: 'gstAmount', header: 'GST Amount', render: (r) => formatRupees(r.gstAmount) },
    { key: 'tollAmount', header: 'Toll Amount', render: (r) => formatRupees(r.tollAmount) },
    { key: 'tdsAmount', header: 'TDS Amount', render: (r) => formatRupees(r.tdsAmount) },
    { key: 'grossBillAmount', header: 'Gross Bill Amount', sortable: true, render: (r) => formatRupees(r.grossBillAmount) },
    { key: 'netPayableAmount', header: 'Net Payable Amount', sortable: true, render: (r) => formatRupees(r.netPayableAmount) },
    { key: 'amountPaid', header: 'Amount Paid', render: (r) => formatRupees(r.totalPaidAmount ?? 0) },
    {
      key: 'outstandingAmount',
      header: 'Outstanding Amount',
      render: (r) => <span className={(r.outstandingAmount ?? 0) > 0 ? 'font-semibold text-red-600 dark:text-red-400' : ''}>{formatRupees(r.outstandingAmount ?? 0)}</span>,
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
        title="Subcontractor Payments"
        description="Month-wise subcontractor bills against Forays projects — TDS, GST, payment processing and outstanding balances"
        actions={
          can('SUBCONTRACTORS', 'add') && (
            <button className="btn-primary" onClick={() => setAddModalOpen(true)}>
              <Plus size={16} /> Add New Subcontractor Bill
            </button>
          )
        }
      />

      <div className="card mb-6 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          <div>
            <label className="label">Payment Status</label>
            <select className="input" value={filters.paymentStatus} onChange={(e) => setFilters((f) => ({ ...f, paymentStatus: e.target.value }))}>
              <option value="">All Status</option>
              {SUBCONTRACTOR_BILL_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Invoice Number</label>
            <input className="input" value={filters.invoiceNumber} onChange={(e) => setFilters((f) => ({ ...f, invoiceNumber: e.target.value }))} />
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

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Bills" value={totals?.totalBills ?? 0} icon={FileText} />
        <StatCard label="Total Net Payable" value={formatRupees(totals?.totalNetPayableAmount ?? 0)} icon={IndianRupee} />
        <StatCard label="Total Amount Paid" value={formatRupees(totals?.totalAmountPaid ?? 0)} icon={Wallet} accent="emerald" />
        <StatCard label="Total Outstanding" value={formatRupees(totals?.totalOutstandingAmount ?? 0)} icon={AlertTriangle} accent="amber" />
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

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setViewBill(row)}>
              {can('SUBCONTRACTORS', 'edit') ? 'Edit' : 'View'}
            </button>
            {can('SUBCONTRACTORS', 'delete') && (
              <button className="btn-ghost px-2 py-1 text-xs text-red-500" onClick={() => setDeleteBill(row)}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      />

      <AddBillModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />

      <BillDetailModal bill={viewBill} onClose={() => setViewBill(null)} readOnly={!can('SUBCONTRACTORS', 'edit')} />

      <ConfirmDialog
        open={deleteBill !== null}
        title="Delete Subcontractor Bill"
        message={`Delete the bill for Invoice "${deleteBill?.invoiceNumber}"? All payment processing entries recorded against it will also be deleted. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteBill(null)}
        onConfirm={() => deleteBill && deleteMutation.mutate(deleteBill.id)}
      />
    </div>
  );
}
