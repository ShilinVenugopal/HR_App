import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PurchaseRequisition, purchaseRequisitionsApi } from '../api/modules';
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

export default function PurchaseRequisitions() {
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

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-requisitions', page, search, filters, sort],
    queryFn: () =>
      purchaseRequisitionsApi.list({
        page,
        pageSize: 10,
        search,
        ...filters,
        ...(sort ? { sortBy: sort.key, sortOrder: sort.dir } : {}),
      }),
  });

  const columns: Column<PurchaseRequisition>[] = [
    { key: 'requestNumber', header: 'Request No.', sortable: true, render: (r) => <span className="font-mono text-xs font-medium">{r.requestNumber}</span> },
    { key: 'prNumber', header: 'PR No.', render: (r) => r.prNumber ?? '—' },
    { key: 'project', header: 'Project', render: (r) => r.project?.projectName ?? '—' },
    { key: 'requester', header: 'Requester', render: (r) => r.requester?.name ?? '—' },
    { key: 'department', header: 'Department', render: (r) => r.department?.name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
    { key: 'currentApprover', header: 'Approver', render: (r) => r.currentApprover?.name ?? '—' },
    { key: 'createdAt', header: 'Created Date', sortable: true, render: (r) => new Date(r.createdAt).toLocaleDateString() },
  ];

  return (
    <div>
      <PageHeader
        title="Purchase Requisition"
        description="Raise, submit, and track project-wise purchase requisitions"
        actions={
          can('PURCHASE_REQUISITION', 'add') && (
            <button className="btn-primary" onClick={() => navigate('/purchase-requisitions/new')}>
              <Plus size={16} /> New Purchase Requisition
            </button>
          )
        }
      />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={searchInput}
        searchPlaceholder="Search request no. / PR no..."
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
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => navigate(`/purchase-requisitions/${row.id}`)}>
            View
          </button>
        )}
      />
    </div>
  );
}
