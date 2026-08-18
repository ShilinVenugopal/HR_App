import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { PageHeader } from '../common/PageHeader';
import { DataTable, Column } from '../common/DataTable';
import { Badge } from '../common/Badge';
import { Ticket, TicketPriority, TicketStatus, ticketsApi } from '../../api/modules';
import { useAssignableUserOptions, useTicketCategoryOptions } from '../../hooks/useLookups';

const STATUS_OPTIONS: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED'];
const PRIORITY_OPTIONS: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_USER: 'Waiting for User',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/// Shared list/filter/pagination view behind My Tickets, Assigned to Me,
/// and All Tickets — the only difference between those three pages is
/// which `scope` they pass here, so the columns/filters/pagination logic
/// lives in exactly one place. The backend independently re-enforces the
/// scope regardless of what's requested (tickets.service.ts's accessWhere),
/// so this component never has to defend against an unauthorized scope.
export function TicketListView({
  scope,
  title,
  description,
  showRaisedByFilter,
}: {
  scope: 'mine' | 'assigned' | 'all';
  title: string;
  description: string;
  showRaisedByFilter?: boolean;
}) {
  const navigate = useNavigate();
  const categoryOptions = useTicketCategoryOptions();
  const userOptions = useAssignableUserOptions();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [raisedById, setRaisedById] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', scope, page, search, status, priority, categoryId, raisedById, assignedToId, dateFrom, dateTo],
    queryFn: () =>
      ticketsApi.list({
        page,
        pageSize: 20,
        search,
        scope,
        status: status || undefined,
        priority: priority || undefined,
        categoryId: categoryId || undefined,
        raisedById: raisedById || undefined,
        assignedToId: assignedToId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  const columns: Column<Ticket>[] = [
    { key: 'ticketNo', header: 'Ticket No.', render: (r) => <span className="font-mono text-xs font-medium">{r.ticketNo}</span> },
    { key: 'subject', header: 'Subject', render: (r) => <span className="font-medium">{r.subject}</span> },
    { key: 'category', header: 'Category', render: (r) => r.category?.name ?? '—' },
    { key: 'priority', header: 'Priority', render: (r) => <Badge value={r.priority} /> },
    {
      key: 'assignedTo',
      header: 'Assigned To',
      render: (r) => (r.assignees.length ? r.assignees.map((a) => a.user.name).join(', ') : '—'),
    },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} label={STATUS_LABEL[r.status]} /> },
    { key: 'createdAt', header: 'Created', render: (r) => new Date(r.createdAt).toLocaleDateString() },
    { key: 'updatedAt', header: 'Updated', render: (r) => new Date(r.updatedAt).toLocaleDateString() },
  ];

  if (scope === 'all') {
    columns.splice(2, 0, { key: 'raisedBy', header: 'Raised By', render: (r) => r.raisedBy?.name ?? '—' });
  }

  return (
    <div>
      <PageHeader title={title} description={description} />
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={search}
        searchPlaceholder="Search ticket no., subject, description..."
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        rowActions={(r) => (
          <button className="btn-ghost p-1.5" title="View" onClick={() => navigate(`/tickets/${r.id}`)}>
            <Eye size={15} />
          </button>
        )}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All Status</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select className="input w-auto" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
              <option value="">All Priority</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <select className="input w-auto" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
              <option value="">All Categories</option>
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            {scope === 'all' && (
              <select className="input w-auto" value={assignedToId} onChange={(e) => { setAssignedToId(e.target.value); setPage(1); }}>
                <option value="">All Assignees</option>
                {userOptions.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            )}
            {showRaisedByFilter && (
              <select className="input w-auto" value={raisedById} onChange={(e) => { setRaisedById(e.target.value); setPage(1); }}>
                <option value="">All Raised By</option>
                {userOptions.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            )}
            <input
              type="date"
              className="input w-auto"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              title="From date"
            />
            <input
              type="date"
              className="input w-auto"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              title="To date"
            />
          </div>
        }
      />
    </div>
  );
}
