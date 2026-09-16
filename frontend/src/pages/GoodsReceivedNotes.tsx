import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { GoodsReceivedNote, grnsApi, purchaseOrdersApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column, SortState } from '../components/common/DataTable';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { useProjectOptions } from '../hooks/useLookups';

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'RETURNED', label: 'Returned' },
];

export default function GoodsReceivedNotes() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const projectOptions = useProjectOptions();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ projectId: '', status: '' });
  const [sort, setSort] = useState<SortState | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // "Pending GRN List" — Approved Purchase Orders ready to have a GRN
  // raised against them, same pattern as PurchaseOrders' "Pending PO List".
  const { data: approvedPos } = useQuery({
    queryKey: ['approved-pos-for-grn'],
    queryFn: () => purchaseOrdersApi.list({ status: 'APPROVED', pageSize: 20 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['grns', page, search, filters, sort],
    queryFn: () =>
      grnsApi.list({
        page,
        pageSize: 10,
        search,
        ...filters,
        ...(sort ? { sortBy: sort.key, sortOrder: sort.dir } : {}),
      }),
  });

  const columns: Column<GoodsReceivedNote>[] = [
    { key: 'grnNumber', header: 'GRN Number', sortable: true, render: (r) => <span className="font-mono text-xs font-medium">{r.grnNumber}</span> },
    { key: 'po', header: 'PO Number', render: (r) => r.po?.poNumber ?? '—' },
    { key: 'project', header: 'Project', render: (r) => r.project?.projectName ?? '—' },
    { key: 'supplierName', header: 'Supplier', render: (r) => r.supplierName ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
    { key: 'grnDate', header: 'GRN Date', sortable: true, render: (r) => new Date(r.grnDate).toLocaleDateString() },
    {
      key: 'inventoryUpdatedAt',
      header: 'Inventory Updated',
      render: (r) => (r.inventoryUpdatedAt ? <Badge value="APPROVED" label="Yes" /> : <Badge value="PENDING" label="No" />),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Goods Received Note"
        description="Record receipt of materials against approved Purchase Orders"
        actions={
          can('GRN', 'add') && (
            <button className="btn-primary" onClick={() => navigate('/grns/new')}>
              <Plus size={16} /> New GRN
            </button>
          )
        }
      />

      {can('GRN', 'add') && approvedPos && approvedPos.data.length > 0 && (
        <div className="card mb-6 p-4">
          <h3 className="mb-3 text-sm font-semibold">Pending GRN List — Approved Purchase Orders</h3>
          <div className="space-y-2">
            {approvedPos.data.map((po) => (
              <div key={po.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <div>
                  <span className="font-mono text-xs">{po.poNumber}</span> — {po.project?.projectName} — {po.vendor?.name} — {po.items.length} item(s)
                </div>
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => navigate(`/grns/new?fromPo=${po.id}`)}>
                  Create GRN
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
        searchPlaceholder="Search GRN number..."
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
          </>
        }
        rowActions={(row) => (
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => navigate(`/grns/${row.id}`)}>
            View
          </button>
        )}
      />
    </div>
  );
}
