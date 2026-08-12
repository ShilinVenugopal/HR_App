import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Store, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PurchaseOrder, purchaseOrdersApi, purchaseRequisitionsApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column, SortState } from '../components/common/DataTable';
import { Badge } from '../components/common/Badge';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useProjectOptions, useVendorOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PurchaseOrders() {
  const { can, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const projectOptions = useProjectOptions();
  const vendorOptions = useVendorOptions();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ projectId: '', vendorId: '', status: '', month: '', year: '' });
  const [sort, setSort] = useState<SortState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: pendingPrs } = useQuery({
    queryKey: ['pending-prs-for-po'],
    queryFn: () => purchaseRequisitionsApi.list({ status: 'APPROVED', pageSize: 20 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', page, search, filters, sort],
    queryFn: () =>
      purchaseOrdersApi.list({
        page,
        pageSize: 10,
        search,
        ...filters,
        ...(sort ? { sortBy: sort.key, sortOrder: sort.dir } : {}),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => purchaseOrdersApi.remove(id),
    onSuccess: () => {
      toast.success('Purchase Order permanently deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: Column<PurchaseOrder>[] = [
    { key: 'poNumber', header: 'PO Number', sortable: true, render: (r) => <span className="font-mono text-xs font-medium">{r.poNumber}</span> },
    { key: 'vendor', header: 'Vendor', render: (r) => r.vendor?.name ?? '—' },
    { key: 'project', header: 'Project', render: (r) => r.project?.projectName ?? '—' },
    { key: 'grandTotal', header: 'Grand Total', sortable: true, render: (r) => `₹${Number(r.grandTotal).toLocaleString('en-IN')}` },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
    { key: 'poDate', header: 'PO Date', sortable: true, render: (r) => new Date(r.poDate).toLocaleDateString() },
  ];

  return (
    <div>
      <PageHeader
        title="Purchase Order"
        description="Create, approve, and track project-wise purchase orders"
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => navigate('/vendors')}>
              <Store size={16} /> Vendor Management
            </button>
            {can('PURCHASE_ORDER', 'add') && (
              <button className="btn-primary" onClick={() => navigate('/purchase-orders/new')}>
                <Plus size={16} /> New Purchase Order
              </button>
            )}
          </div>
        }
      />

      {can('PURCHASE_ORDER', 'add') && pendingPrs && pendingPrs.data.length > 0 && (
        <div className="card mb-6 p-4">
          <h3 className="mb-3 text-sm font-semibold">Pending PO List — Approved Purchase Requisitions</h3>
          <div className="space-y-2">
            {pendingPrs.data.map((pr) => (
              <div key={pr.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <div>
                  <span className="font-mono text-xs">{pr.requestNumber}</span> — {pr.project?.projectName} — {pr.items.length} item(s)
                </div>
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => navigate(`/purchase-orders/new?fromPr=${pr.id}`)}>
                  Create PO
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={searchInput}
        searchPlaceholder="Search PO number..."
        onSearchChange={setSearchInput}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        filters={
          <>
            <select
              className="input w-auto"
              value={filters.projectId}
              onChange={(e) => {
                setFilters((f) => ({ ...f, projectId: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All Projects</option>
              {projectOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              className="input w-auto"
              value={filters.vendorId}
              onChange={(e) => {
                setFilters((f) => ({ ...f, vendorId: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All Vendors</option>
              {vendorOptions.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
            <select
              className="input w-auto"
              value={filters.status}
              onChange={(e) => {
                setFilters((f) => ({ ...f, status: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All Status</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              className="input w-auto"
              value={filters.month}
              onChange={(e) => {
                setFilters((f) => ({ ...f, month: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All Months</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Year"
              className="input w-24"
              value={filters.year}
              onChange={(e) => {
                setFilters((f) => ({ ...f, year: e.target.value }));
                setPage(1);
              }}
            />
          </>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => navigate(`/purchase-orders/${row.id}`)}>
              View
            </button>
            {isSuperAdmin && (
              <button
                className="btn-ghost p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                title="Delete"
                disabled={deleteMutation.isPending && deleteMutation.variables === row.id}
                onClick={() => setDeleteTarget(row)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Permanently Delete Purchase Order?"
        message={
          `Are you sure you want to permanently delete this Purchase Order? This action cannot be undone.\n\n` +
          `PO Number: ${deleteTarget?.poNumber ?? '—'}\n` +
          `Vendor: ${deleteTarget?.vendor?.name ?? '—'}\n` +
          `Status: ${deleteTarget?.status ?? '—'}`
        }
        confirmLabel="Permanently Delete"
        danger
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
