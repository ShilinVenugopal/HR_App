import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Inbox, Loader2, Clock, CheckCircle2, Archive, ListChecks } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { ticketsApi } from '../api/modules';
import { useAuth } from '../context/AuthContext';

export default function TicketsDashboard() {
  const navigate = useNavigate();
  const { can, isSuperAdmin } = useAuth();
  const canSeeAll = isSuperAdmin || can('TICKETS', 'approve');

  const { data, isLoading } = useQuery({
    queryKey: ['tickets-dashboard'],
    queryFn: () => ticketsApi.dashboard(),
  });

  const mine = data?.mine;
  const org = data?.organization;

  return (
    <div>
      <PageHeader title="Ticket Dashboard" description="Overview of your tickets and helpdesk activity" />

      <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-400">My Tickets</h3>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={mine?.total ?? 0} icon={Inbox} loading={isLoading} />
        <StatCard label="Open" value={mine?.open ?? 0} icon={Inbox} loading={isLoading} accent="amber" />
        <StatCard label="In Progress" value={mine?.inProgress ?? 0} icon={Loader2} loading={isLoading} accent="brand" />
        <StatCard label="Waiting for User" value={mine?.waiting ?? 0} icon={Clock} loading={isLoading} accent="amber" />
        <StatCard label="Resolved" value={mine?.resolved ?? 0} icon={CheckCircle2} loading={isLoading} accent="emerald" />
        <StatCard label="Closed" value={mine?.closed ?? 0} icon={Archive} loading={isLoading} />
      </div>

      {canSeeAll && org && (
        <>
          <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-400">Organization-Wide</h3>
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Total" value={org.total} icon={ListChecks} />
            <StatCard label="Open" value={org.open} icon={Inbox} accent="amber" />
            <StatCard label="In Progress" value={org.inProgress} icon={Loader2} accent="brand" />
            <StatCard label="Waiting for User" value={org.waiting} icon={Clock} accent="amber" />
            <StatCard label="Resolved" value={org.resolved} icon={CheckCircle2} accent="emerald" />
            <StatCard label="Closed" value={org.closed} icon={Archive} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="card p-5">
              <h4 className="mb-3 text-sm font-semibold">Tickets by Category</h4>
              <div className="space-y-2">
                {org.byCategory.map((c) => (
                  <div key={c.category} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{c.category}</span>
                    <span className="font-medium">{c.count}</span>
                  </div>
                ))}
                {org.byCategory.length === 0 && <p className="text-sm text-slate-400">No data yet</p>}
              </div>
            </div>
            <div className="card p-5">
              <h4 className="mb-3 text-sm font-semibold">Tickets by Priority</h4>
              <div className="space-y-2">
                {org.byPriority.map((p) => (
                  <div key={p.priority} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{p.priority.charAt(0) + p.priority.slice(1).toLowerCase()}</span>
                    <span className="font-medium">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => navigate('/tickets/new')}>
          Raise New Ticket
        </button>
        <button className="btn-secondary" onClick={() => navigate('/tickets/my')}>
          View My Tickets
        </button>
        <button className="btn-secondary" onClick={() => navigate('/tickets/assigned')}>
          View Assigned to Me
        </button>
      </div>
    </div>
  );
}
