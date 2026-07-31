import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileDown, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import {
  BILLING_STATUS_OPTIONS,
  BillingItem,
  BillingItemStatus,
  billingStatusApi,
} from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column, SortState } from '../components/common/DataTable';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';
import { exportBillingStatusExcel } from '../utils/billingStatusExcel';
import { AddBillDetailsModal } from '../components/billingStatus/AddBillDetailsModal';
import { BillingItemModal } from '../components/billingStatus/BillingItemModal';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Filters {
  projectId: string;
  billingMonth: string;
  billingYear: string;
  periodFrom: string;
  periodTo: string;
  plantUnit: string;
  status: string;
  invoiceNo: string;
  jmsNo: string;
}

const EMPTY_FILTERS: Filters = {
  projectId: '',
  billingMonth: '',
  billingYear: '',
  periodFrom: '',
  periodTo: '',
  plantUnit: '',
  status: '',
  invoiceNo: '',
  jmsNo: '',
};

export default function BillingStatus() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<BillingItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<BillingItem | null>(null);
  const [exporting, setExporting] = useState(false);

  const queryParams = {
    projectId: appliedFilters.projectId || undefined,
    billingMonth: appliedFilters.billingMonth ? Number(appliedFilters.billingMonth) : undefined,
    billingYear: appliedFilters.billingYear ? Number(appliedFilters.billingYear) : undefined,
    periodFrom: appliedFilters.periodFrom || undefined,
    periodTo: appliedFilters.periodTo || undefined,
    plantUnit: appliedFilters.plantUnit || undefined,
    status: (appliedFilters.status || undefined) as BillingItemStatus | undefined,
    invoiceNo: appliedFilters.invoiceNo || undefined,
    jmsNo: appliedFilters.jmsNo || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['billing-status', page, queryParams, sort],
    queryFn: () =>
      billingStatusApi.list({
        page,
        pageSize: 10,
        ...queryParams,
        ...(sort ? { sortBy: sort.key, sortOrder: sort.dir } : {}),
      }),
  });

  const { data: summary } = useQuery({
    queryKey: ['billing-status-summary', queryParams],
    queryFn: () => billingStatusApi.summary(queryParams),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => billingStatusApi.removeItem(id),
    onSuccess: () => {
      toast.success('Billing item deleted');
      setDeleteItem(null);
      queryClient.invalidateQueries({ queryKey: ['billing-status'] });
      queryClient.invalidateQueries({ queryKey: ['billing-status-summary'] });
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

  const handleExport = async () => {
    setExporting(true);
    try {
      const full = await billingStatusApi.list({ page: 1, pageSize: 5000, ...queryParams });
      await exportBillingStatusExcel(full.data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<BillingItem>[] = [
    { key: 'srNo', header: 'Sr No', render: (r) => r.srNo },
    { key: 'project', header: 'Project', render: (r) => r.billingRecord?.project?.projectName ?? '—' },
    {
      key: 'period',
      header: 'Billing Month/Year',
      render: (r) => (r.billingRecord ? `${MONTHS[r.billingRecord.billingMonth - 1]} ${r.billingRecord.billingYear}` : '—'),
    },
    { key: 'plantUnit', header: 'Plant/Unit', sortable: true, render: (r) => r.plantUnit },
    { key: 'invoiceNo', header: 'Invoice No', render: (r) => r.invoiceNo ?? '—' },
    { key: 'jmsNo', header: 'JMS No', render: (r) => r.jmsNo ?? '—' },
    { key: 'abstractAmount', header: 'Abstract Amount', sortable: true, render: (r) => `₹${Number(r.abstractAmount).toLocaleString('en-IN')}` },
    { key: 'taxAmount', header: 'Tax Amount', sortable: true, render: (r) => `₹${Number(r.taxAmount).toLocaleString('en-IN')}` },
    { key: 'totalAmount', header: 'Total Amount', sortable: true, render: (r) => `₹${Number(r.totalAmount).toLocaleString('en-IN')}` },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} label={BILLING_STATUS_OPTIONS.find((s) => s.value === r.status)?.label} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Billing Status"
        description="Project-wise billing records, tracked from Pending Certification through Invoice Done"
        actions={
          <div className="flex flex-wrap gap-2">
            {can('BILLING_STATUS', 'add') && (
              <button className="btn-primary" onClick={() => setAddModalOpen(true)}>
                <Plus size={16} /> Add Bill Details
              </button>
            )}
            <button className="btn-secondary" disabled={exporting} onClick={handleExport}>
              <FileDown size={16} /> Export Excel
            </button>
          </div>
        }
      />

      <div className="card mb-6 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Project</label>
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
            <input
              type="number"
              className="input"
              placeholder="e.g. 2026"
              value={filters.billingYear}
              onChange={(e) => setFilters((f) => ({ ...f, billingYear: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              {BILLING_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Period From</label>
            <input type="date" className="input" value={filters.periodFrom} onChange={(e) => setFilters((f) => ({ ...f, periodFrom: e.target.value }))} />
          </div>
          <div>
            <label className="label">Period To</label>
            <input type="date" className="input" value={filters.periodTo} onChange={(e) => setFilters((f) => ({ ...f, periodTo: e.target.value }))} />
          </div>
          <div>
            <label className="label">Plant / Unit</label>
            <input className="input" value={filters.plantUnit} onChange={(e) => setFilters((f) => ({ ...f, plantUnit: e.target.value }))} />
          </div>
          <div>
            <label className="label">Invoice No.</label>
            <input className="input" value={filters.invoiceNo} onChange={(e) => setFilters((f) => ({ ...f, invoiceNo: e.target.value }))} />
          </div>
          <div>
            <label className="label">JMS No.</label>
            <input className="input" value={filters.jmsNo} onChange={(e) => setFilters((f) => ({ ...f, jmsNo: e.target.value }))} />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={handleSearch}>
            <Search size={16} /> Search
          </button>
          <button className="btn-secondary" onClick={handleReset}>
            <RotateCcw size={16} /> Reset
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Bills" value={summary?.totalBills ?? 0} icon={FileDown} />
        <StatCard label="Total Abstract Amount" value={`₹${(summary?.totalAbstractAmount ?? 0).toLocaleString('en-IN')}`} icon={FileDown} />
        <StatCard label="Total Tax Amount" value={`₹${(summary?.totalTaxAmount ?? 0).toLocaleString('en-IN')}`} icon={FileDown} />
        <StatCard label="Total Billing Amount" value={`₹${(summary?.totalAmount ?? 0).toLocaleString('en-IN')}`} icon={FileDown} accent="emerald" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {BILLING_STATUS_OPTIONS.map((s) => (
          <div key={s.value} className="card p-3">
            <Badge value={s.value} label={s.label} />
            <p className="mt-2 text-xl font-semibold">{summary?.statusCounts?.[s.value] ?? 0}</p>
          </div>
        ))}
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
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditItem(row)}>
              {can('BILLING_STATUS', 'edit') ? 'Edit' : 'View'}
            </button>
            {can('BILLING_STATUS', 'delete') && (
              <button className="btn-ghost px-2 py-1 text-xs text-red-500" onClick={() => setDeleteItem(row)}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      />

      <AddBillDetailsModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />

      <BillingItemModal item={editItem} onClose={() => setEditItem(null)} readOnly={!can('BILLING_STATUS', 'edit')} />

      <ConfirmDialog
        open={deleteItem !== null}
        title="Delete Billing Item"
        message={`Delete the billing row for "${deleteItem?.plantUnit}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteItem(null)}
        onConfirm={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
      />
    </div>
  );
}
