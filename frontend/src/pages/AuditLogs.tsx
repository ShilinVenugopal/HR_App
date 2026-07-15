import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuditLogRow, auditLogsApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Badge } from '../components/common/Badge';

const ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'CREATE',
  'UPDATE',
  'DELETE',
  'APPROVE',
  'FAILED_LOGIN',
  'UNAUTHORIZED_ACCESS',
  'PASSWORD_RESET',
  'EXPORT',
];

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ action: '', status: '', dateFrom: '', dateTo: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, search, filters],
    queryFn: () => auditLogsApi.list({ page, pageSize: 15, search, ...filters }),
  });

  const columns: Column<AuditLogRow>[] = [
    { key: 'createdAt', header: 'Timestamp', render: (r) => new Date(r.createdAt).toLocaleString() },
    {
      key: 'user',
      header: 'User',
      render: (r) => (
        <div>
          <p className="font-medium">{r.user?.name ?? r.userEmail ?? 'Unknown'}</p>
          {r.user?.email && <p className="text-xs text-slate-400">{r.user.email}</p>}
        </div>
      ),
    },
    { key: 'action', header: 'Action', render: (r) => r.action.replace(/_/g, ' ') },
    { key: 'module', header: 'Module', render: (r) => r.module ?? '—' },
    { key: 'project', header: 'Project', render: (r) => r.project?.projectName ?? '—' },
    { key: 'ip', header: 'IP Address', render: (r) => r.ipAddress ?? '—' },
    {
      key: 'device',
      header: 'Device / Browser',
      render: (r) => (
        <span className="text-xs text-slate-500">
          {r.device ?? '—'} · {r.browser ?? '—'}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Login, logout, CRUD, approvals, failed logins and unauthorized access attempts across the system"
      />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        emptyLabel="No audit activity found for the selected filters"
        filters={
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto" value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}>
              <option value="">All Actions</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <select className="input w-auto" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILURE">Failure</option>
            </select>
            <input
              type="date"
              className="input w-auto"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
            <input
              type="date"
              className="input w-auto"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </div>
        }
      />
    </div>
  );
}
