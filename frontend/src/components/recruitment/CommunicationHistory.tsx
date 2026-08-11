import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Paperclip, RotateCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, Column } from '../common/DataTable';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Badge } from '../common/Badge';
import { apiErrorMessage } from '../../api/client';
import { CommChannel, CommunicationMessageLog, communicationApi } from '../../api/modules';
import { useAuth } from '../../context/AuthContext';
import { useProjectOptions } from '../../hooks/useLookups';
import { MESSAGE_STATUS_OPTIONS } from '../../utils/communicationConstants';

export function CommunicationHistory() {
  const { can, isSuperAdmin } = useAuth();
  const canManage = can('RECRUITMENT', 'approve');
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ channel: '', status: '', projectId: '', dateFrom: '', dateTo: '' });
  const [detail, setDetail] = useState<CommunicationMessageLog | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommunicationMessageLog | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['comm-history', page, search, filters],
    queryFn: () => communicationApi.history({ page, pageSize: 15, search, ...filters }),
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => communicationApi.resend(id),
    onSuccess: () => {
      toast.success('Message re-queued for sending');
      queryClient.invalidateQueries({ queryKey: ['comm-history'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => communicationApi.deleteHistory(id),
    onSuccess: () => {
      toast.success('Communication deleted successfully.');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['comm-history'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(true);
    try {
      const full = await communicationApi.history({ page: 1, pageSize: 5000, search, ...filters });
      const rows: CommunicationMessageLog[] = full.data;
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Communication History');
      sheet.columns = [
        { header: 'Candidate', key: 'candidate', width: 24 },
        { header: 'Channel', key: 'channel', width: 12 },
        { header: 'Recipient', key: 'recipient', width: 24 },
        { header: 'Subject', key: 'subject', width: 30 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Sent By', key: 'sentBy', width: 20 },
        { header: 'Project', key: 'project', width: 20 },
        { header: 'Date', key: 'date', width: 22 },
        { header: 'Error', key: 'error', width: 30 },
      ];
      sheet.getRow(1).font = { bold: true };
      sheet.addRows(
        rows.map((r) => ({
          candidate: r.candidate?.candidateName ?? '',
          channel: r.channel,
          recipient: r.recipientEmail ?? r.recipientPhone ?? '',
          subject: r.subject ?? '',
          status: r.status,
          sentBy: r.batch?.createdBy?.name ?? '',
          project: r.project?.projectName ?? '',
          date: new Date(r.createdAt).toLocaleString(),
          error: r.errorReason ?? '',
        }))
      );

      const buffer = format === 'xlsx' ? await workbook.xlsx.writeBuffer() : await workbook.csv.writeBuffer();
      const mime = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv';
      const blob = new Blob([buffer], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Communication_History.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<CommunicationMessageLog>[] = [
    { key: 'candidate', header: 'Candidate', render: (r) => <span className="font-medium">{r.candidate?.candidateName ?? '—'}</span> },
    { key: 'channel', header: 'Channel', render: (r) => <Badge value={r.channel} /> },
    { key: 'recipient', header: 'Recipient', render: (r) => r.recipientEmail ?? r.recipientPhone ?? '—' },
    { key: 'subject', header: 'Subject / Message', render: (r) => <span className="line-clamp-1 max-w-xs text-slate-500">{r.subject || r.body}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
    { key: 'sentBy', header: 'Sent By', render: (r) => r.batch?.createdBy?.name ?? '—' },
    {
      key: 'attachment',
      header: 'Attachment',
      render: (r) => (r.batch?.attachments?.length ? <Paperclip size={14} className="text-slate-400" /> : '—'),
    },
    { key: 'date', header: 'Date', render: (r) => new Date(r.createdAt).toLocaleString() },
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
        headerActions={
          <>
            <button className="btn-secondary" disabled={exporting} onClick={() => handleExport('csv')}>
              <Download size={15} /> CSV
            </button>
            <button className="btn-secondary" disabled={exporting} onClick={() => handleExport('xlsx')}>
              <Download size={15} /> Excel
            </button>
          </>
        }
        filters={
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto" value={filters.channel} onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}>
              <option value="">All Channels</option>
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp</option>
            </select>
            <select className="input w-auto" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              {MESSAGE_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select className="input w-auto" value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">All Projects</option>
              {projectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input type="date" className="input w-auto" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
            <input type="date" className="input w-auto" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          </div>
        }
        emptyLabel="No communication sent yet"
        rowActions={(r) => (
          <div className="flex justify-end gap-1">
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setDetail(r)}>
              Open
            </button>
            {canManage && (r.status === 'FAILED' || r.status === 'BOUNCED') && (
              <button className="btn-ghost p-1.5" title="Resend" onClick={() => resendMutation.mutate(r.id)}>
                <RotateCw size={14} />
              </button>
            )}
            {isSuperAdmin && (
              <button
                className="btn-ghost p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                title="Delete"
                disabled={deleteMutation.isPending && deleteMutation.variables === r.id}
                onClick={() => setDeleteTarget(r)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Communication?"
        message={
          `Are you sure you want to delete this communication record? This only removes it from the ERP history — it does not unsend or recall anything already delivered.\n\n` +
          `Candidate: ${deleteTarget?.candidate?.candidateName ?? '—'}\n` +
          `Recipient: ${deleteTarget?.recipientEmail ?? deleteTarget?.recipientPhone ?? '—'}\n` +
          `Subject: ${deleteTarget?.subject || deleteTarget?.body || '—'}\n` +
          `Status: ${deleteTarget?.status ?? '—'}`
        }
        confirmLabel="Delete"
        danger
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Message Detail" size="lg">
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="label">Candidate</p>
                <p>{detail.candidate?.candidateName}</p>
              </div>
              <div>
                <p className="label">Recipient</p>
                <p>{detail.recipientEmail ?? detail.recipientPhone}</p>
              </div>
              <div>
                <p className="label">Channel</p>
                <Badge value={detail.channel} />
              </div>
              <div>
                <p className="label">Status</p>
                <Badge value={detail.status} />
              </div>
              <div>
                <p className="label">Sent By</p>
                <p>{detail.batch?.createdBy?.name ?? '—'}</p>
              </div>
              <div>
                <p className="label">Template</p>
                <p>{detail.batch?.template?.name ?? 'Custom message'}</p>
              </div>
            </div>
            {detail.subject && (
              <div>
                <p className="label">Subject</p>
                <p>{detail.subject}</p>
              </div>
            )}
            <div>
              <p className="label">Message</p>
              <div className="whitespace-pre-wrap rounded-lg border border-slate-200 p-3 dark:border-slate-800">{detail.body}</div>
            </div>
            {detail.errorReason && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
                {detail.errorReason}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
              <p>Created: {new Date(detail.createdAt).toLocaleString()}</p>
              {detail.sentAt && <p>Sent: {new Date(detail.sentAt).toLocaleString()}</p>}
              {detail.deliveredAt && <p>Delivered: {new Date(detail.deliveredAt).toLocaleString()}</p>}
              {detail.openedAt && <p>Opened: {new Date(detail.openedAt).toLocaleString()}</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
