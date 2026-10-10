import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, RotateCcw, Search } from 'lucide-react';
import { SiteAccountStatement, siteAccountsApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column, SortState } from '../components/common/DataTable';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { useProjectOptions } from '../hooks/useLookups';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Filters {
  projectId: string;
  projectNumber: string;
  periodFrom: string;
  periodTo: string;
  statementMonth: string;
  statementYear: string;
  status: string;
  voucherNo: string;
  costCode: string;
}

const EMPTY_FILTERS: Filters = {
  projectId: '',
  projectNumber: '',
  periodFrom: '',
  periodTo: '',
  statementMonth: '',
  statementYear: '',
  status: '',
  voucherNo: '',
  costCode: '',
};

export default function SiteAccounts() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const projectOptions = useProjectOptions();

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);

  const queryParams = {
    projectId: appliedFilters.projectId || undefined,
    projectNumber: appliedFilters.projectNumber || undefined,
    periodFrom: appliedFilters.periodFrom || undefined,
    periodTo: appliedFilters.periodTo || undefined,
    statementMonth: appliedFilters.statementMonth ? Number(appliedFilters.statementMonth) : undefined,
    statementYear: appliedFilters.statementYear ? Number(appliedFilters.statementYear) : undefined,
    status: (appliedFilters.status || undefined) as 'DRAFT' | 'SAVED' | undefined,
    voucherNo: appliedFilters.voucherNo || undefined,
    costCode: appliedFilters.costCode || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['site-accounts', page, queryParams, sort],
    queryFn: () =>
      siteAccountsApi.list({
        page,
        pageSize: 10,
        ...queryParams,
        ...(sort ? { sortBy: sort.key, sortOrder: sort.dir } : {}),
      }),
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

  const columns: Column<SiteAccountStatement>[] = [
    { key: 'project', header: 'Project / Plant-Site', render: (r) => r.project?.projectName ?? '—' },
    { key: 'projectNumber', header: 'Project No.', render: (r) => r.project?.projectNumber ?? '—' },
    {
      key: 'period',
      header: 'Statement Period',
      render: (r) => `${new Date(r.periodFrom).toLocaleDateString()} – ${new Date(r.periodTo).toLocaleDateString()}`,
    },
    { key: 'statementMonth', header: 'Month/Year', sortable: true, render: (r) => `${MONTHS[r.statementMonth - 1]} ${r.statementYear}` },
    { key: 'totalReceipts', header: 'Total Receipts', render: (r) => `₹${r.totals.totalReceipts.toLocaleString('en-IN')}` },
    { key: 'totalPayments', header: 'Total Payments', render: (r) => `₹${r.totals.totalPayments.toLocaleString('en-IN')}` },
    { key: 'balanceInHand', header: 'Balance in Hand', render: (r) => `₹${r.totals.balanceInHand.toLocaleString('en-IN')}` },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Site Accounts"
        description="Project-wise site account statements — receipts, deposits/advances and payments against the standard cost-code structure"
        actions={
          can('SITE_ACCOUNTS', 'add') && (
            <button className="btn-primary" onClick={() => navigate('/site-accounts/new')}>
              <Plus size={16} /> New Statement
            </button>
          )
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
            <label className="label">Project Number</label>
            <input className="input" value={filters.projectNumber} onChange={(e) => setFilters((f) => ({ ...f, projectNumber: e.target.value }))} />
          </div>
          <div>
            <label className="label">Month</label>
            <select className="input" value={filters.statementMonth} onChange={(e) => setFilters((f) => ({ ...f, statementMonth: e.target.value }))}>
              <option value="">All Months</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <input
              type="number"
              className="input"
              placeholder="e.g. 2026"
              value={filters.statementYear}
              onChange={(e) => setFilters((f) => ({ ...f, statementYear: e.target.value }))}
            />
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
            <label className="label">Status</label>
            <select className="input" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="SAVED">Saved</option>
            </select>
          </div>
          <div>
            <label className="label">Voucher Number</label>
            <input className="input" value={filters.voucherNo} onChange={(e) => setFilters((f) => ({ ...f, voucherNo: e.target.value }))} />
          </div>
          <div>
            <label className="label">Cost Code</label>
            <input className="input" placeholder="e.g. F01I" value={filters.costCode} onChange={(e) => setFilters((f) => ({ ...f, costCode: e.target.value }))} />
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
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => navigate(`/site-accounts/${row.id}`)}>
            {can('SITE_ACCOUNTS', 'edit') || can('SITE_ACCOUNTS', 'approve') ? 'View / Edit' : 'View'}
          </button>
        )}
      />
    </div>
  );
}
