import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, Column } from '../common/DataTable';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Badge } from '../common/Badge';
import { apiErrorMessage } from '../../api/client';
import { CommunicationMessageLog, communicationApi } from '../../api/modules';

/// Super Admin only — the parent tab (Recruitment.tsx) only renders this
/// component when isSuperAdmin is true, and the backend route
/// (GET /communication/history/deleted) is independently gated by
/// requireSuperAdmin, so a non-Super-Admin can't reach this data either
/// way even if they forced this component to render.
export function DeletedCommunications() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<CommunicationMessageLog | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['comm-history-deleted', page, search],
    queryFn: () => communicationApi.deletedHistory({ page, pageSize: 15, search }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => communicationApi.restoreHistory(id),
    onSuccess: () => {
      toast.success('Communication restored successfully');
      setRestoreTarget(null);
      queryClient.invalidateQueries({ queryKey: ['comm-history-deleted'] });
      queryClient.invalidateQueries({ queryKey: ['comm-history'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: Column<CommunicationMessageLog>[] = [
    { key: 'candidate', header: 'Candidate', render: (r) => <span className="font-medium">{r.candidate?.candidateName ?? '—'}</span> },
    { key: 'channel', header: 'Channel', render: (r) => <Badge value={r.channel} /> },
    { key: 'recipient', header: 'Recipient', render: (r) => r.recipientEmail ?? r.recipientPhone ?? '—' },
    { key: 'subject', header: 'Subject / Message', render: (r) => <span className="line-clamp-1 max-w-xs text-slate-500">{r.subject || r.body}</span> },
    { key: 'status', header: 'Original Status', render: (r) => <Badge value={r.status} /> },
    { key: 'sentBy', header: 'Sent By', render: (r) => r.batch?.createdBy?.name ?? '—' },
    { key: 'date', header: 'Original Date', render: (r) => new Date(r.createdAt).toLocaleString() },
    { key: 'deletedBy', header: 'Deleted By', render: (r) => r.deletedBy?.name ?? '—' },
    { key: 'deletedAt', header: 'Deleted Date', render: (r) => (r.deletedAt ? new Date(r.deletedAt).toLocaleString() : '—') },
  ];

  return (
    <div>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={search}
        searchPlaceholder="Search by candidate, email or phone..."
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        emptyLabel="No deleted communications"
        rowActions={(r) => (
          <div className="flex justify-end gap-1">
            <button
              className="btn-ghost p-1.5"
              title="Restore"
              disabled={restoreMutation.isPending && restoreMutation.variables === r.id}
              onClick={() => setRestoreTarget(r)}
            >
              <RotateCcw size={14} />
            </button>
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        title="Restore Communication?"
        message={
          `Are you sure you want to restore this communication record? It will reappear in the normal Communication History list.\n\n` +
          `Candidate: ${restoreTarget?.candidate?.candidateName ?? '—'}\n` +
          `Recipient: ${restoreTarget?.recipientEmail ?? restoreTarget?.recipientPhone ?? '—'}\n` +
          `Subject: ${restoreTarget?.subject || restoreTarget?.body || '—'}`
        }
        confirmLabel="Restore"
        confirmDisabled={restoreMutation.isPending}
        onConfirm={() => restoreTarget && restoreMutation.mutate(restoreTarget.id)}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}
