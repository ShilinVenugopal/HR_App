import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Paperclip, Send, Trash2, Users, X } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { MultiSelect } from '../components/common/MultiSelect';
import { TicketActivity, TicketStatus, ticketsApi, uploadsApi } from '../api/modules';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAssignableUserOptions } from '../hooks/useLookups';

const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_USER: 'Waiting for User',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

type Actor = 'raiser' | 'assignee' | 'admin';

/// Mirrors tickets.service.ts's TRANSITIONS map exactly, including which
/// actor role may make each move — the backend independently re-validates
/// and re-checks this on every request (this is UX only, not the security
/// boundary), but showing a button only when it will actually succeed
/// avoids a confusing "why did that fail" 403 for the user.
const TRANSITIONS: Record<TicketStatus, Partial<Record<TicketStatus, Actor[]>>> = {
  OPEN: { IN_PROGRESS: ['assignee', 'admin'] },
  IN_PROGRESS: { WAITING_FOR_USER: ['assignee', 'admin'], RESOLVED: ['assignee', 'admin'] },
  WAITING_FOR_USER: { IN_PROGRESS: ['raiser', 'assignee', 'admin'] },
  RESOLVED: { CLOSED: ['raiser', 'admin'], IN_PROGRESS: ['raiser', 'admin'] },
  CLOSED: { IN_PROGRESS: ['admin'] },
};

function activityLabel(a: TicketActivity): string {
  switch (a.action) {
    case 'TICKET_CREATED':
      return `${a.user.name} created ticket ${a.newValue ?? ''}`;
    case 'ASSIGNED':
      return `${a.user.name} assigned to ${a.newValue}`;
    case 'UNASSIGNED':
      return `${a.user.name} removed ${a.oldValue} from assignees`;
    case 'STATUS_CHANGED': {
      const oldLabel = STATUS_LABEL[a.oldValue as TicketStatus] ?? a.oldValue;
      const newLabel = STATUS_LABEL[a.newValue as TicketStatus] ?? a.newValue;
      return `${a.user.name} changed status from ${oldLabel} to ${newLabel}`;
    }
    case 'PRIORITY_CHANGED':
      return `${a.user.name} changed priority from ${a.oldValue} to ${a.newValue}`;
    case 'COMMENT_ADDED':
      return `${a.user.name} added a comment`;
    case 'ATTACHMENT_ADDED':
      return `${a.user.name} added attachment: ${a.newValue}`;
    default:
      return `${a.user.name} — ${a.action}`;
  }
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, isSuperAdmin, can } = useAuth();
  const userOptions = useAssignableUserOptions();

  const [reply, setReply] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [assigneesModalOpen, setAssigneesModalOpen] = useState(false);
  const [pendingAssignees, setPendingAssignees] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => ticketsApi.get(id!),
    enabled: Boolean(id),
  });
  const ticket = data?.data;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ticket', id] });

  const commentMutation = useMutation({
    mutationFn: async () => {
      await ticketsApi.addComment(id!, reply.trim());
      for (const file of replyFiles) {
        try {
          const uploaded = await uploadsApi.upload(file);
          await ticketsApi.attachFile(id!, {
            fileName: file.name,
            filePath: uploaded.url,
            fileSize: file.size,
            mimeType: file.type || undefined,
          });
        } catch {
          toast.error(`Could not attach "${file.name}"`);
        }
      }
    },
    onSuccess: () => {
      setReply('');
      setReplyFiles([]);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not add reply')),
  });

  const statusMutation = useMutation({
    mutationFn: (status: TicketStatus) => ticketsApi.changeStatus(id!, status),
    onSuccess: () => {
      toast.success('Status updated');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not update status')),
  });

  const assigneesMutation = useMutation({
    mutationFn: (assigneeIds: string[]) => ticketsApi.manageAssignees(id!, assigneeIds),
    onSuccess: () => {
      toast.success('Assignees updated');
      setAssigneesModalOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not update assignees')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => ticketsApi.remove(id!),
    onSuccess: () => {
      toast.success('Ticket deleted');
      navigate('/tickets/my');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not delete ticket')),
  });

  if (isLoading) return <p className="text-sm text-slate-400">Loading...</p>;
  if (!ticket) return <p className="text-sm text-slate-400">Ticket not found or you do not have access to it.</p>;

  const isRaiser = ticket.raisedById === session?.user.id;
  const isAssignee = ticket.assignees.some((a) => a.userId === session?.user.id);
  const isAdmin = isSuperAdmin || can('TICKETS', 'approve') || can('TICKETS', 'edit');
  const canAct = isRaiser || isAssignee || isAdmin;

  const availableTransitions = Object.entries(TRANSITIONS[ticket.status] ?? {}).filter(([, actors]) => {
    if (!actors) return false;
    return (actors.includes('raiser') && isRaiser) || (actors.includes('assignee') && isAssignee) || (actors.includes('admin') && isAdmin);
  }) as [TicketStatus, Actor[]][];

  return (
    <div>
      <PageHeader
        title={`Ticket #${ticket.ticketNo}`}
        description={ticket.subject}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} /> Back
            </button>
            {canAct && (
              <button className="btn-secondary" onClick={() => { setPendingAssignees(ticket.assignees.map((a) => a.userId)); setAssigneesModalOpen(true); }}>
                <Users size={16} /> Manage Assignees
              </button>
            )}
            {isSuperAdmin && (
              <button className="btn-secondary text-red-600" onClick={() => setDeleteConfirmOpen(true)}>
                <Trash2 size={16} /> Delete
              </button>
            )}
          </div>
        }
      />

      <div className="card p-6">
        <div className="mb-4 grid grid-cols-2 gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 sm:grid-cols-4">
          <div>
            <p className="label mb-0.5">Status</p>
            <Badge value={ticket.status} label={STATUS_LABEL[ticket.status]} />
          </div>
          <div>
            <p className="label mb-0.5">Priority</p>
            <Badge value={ticket.priority} />
          </div>
          <div>
            <p className="label mb-0.5">Category</p>
            <p className="text-sm font-medium">{ticket.category?.name}</p>
          </div>
          <div>
            <p className="label mb-0.5">Raised By</p>
            <p className="text-sm font-medium">{ticket.raisedBy?.name}</p>
          </div>
          <div className="col-span-2 sm:col-span-2">
            <p className="label mb-0.5">Assigned To</p>
            <div className="flex flex-wrap gap-1">
              {ticket.assignees.map((a) => (
                <span key={a.id} className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                  {a.user.name}
                </span>
              ))}
              {ticket.assignees.length === 0 && <span className="text-sm text-slate-400">—</span>}
            </div>
          </div>
          <div>
            <p className="label mb-0.5">Created</p>
            <p className="text-sm font-medium">{new Date(ticket.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="label mb-0.5">Last Updated</p>
            <p className="text-sm font-medium">{new Date(ticket.updatedAt).toLocaleString()}</p>
          </div>
        </div>

        {availableTransitions.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
            <span className="text-sm text-slate-500">Change status to:</span>
            {availableTransitions.map(([s]) => (
              <button
                key={s}
                className="btn-secondary"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate(s)}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        )}

        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold">Description</h3>
          <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">{ticket.description}</p>
          {(ticket.attachments ?? []).length > 0 && (
            <div className="mt-3 space-y-1">
              {(ticket.attachments ?? []).map((att) => (
                <a
                  key={att.id}
                  href={att.filePath}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-fit items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-brand-700 hover:underline dark:bg-slate-800/60 dark:text-brand-400"
                >
                  <Paperclip size={13} />
                  {att.fileName} <span className="text-slate-400">({fileSizeLabel(att.fileSize)})</span>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold">Conversation</h3>
          <div className="space-y-4">
            {(ticket.comments ?? []).map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold">{c.user.name}</span>
                  <span className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">{c.comment}</p>
                {c.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {c.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={att.filePath}
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-fit items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-brand-700 hover:underline dark:bg-slate-800/60 dark:text-brand-400"
                      >
                        <Paperclip size={13} />
                        {att.fileName} <span className="text-slate-400">({fileSizeLabel(att.fileSize)})</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {(ticket.comments ?? []).length === 0 && <p className="text-sm text-slate-400">No replies yet.</p>}
          </div>

          {canAct && (
            <div className="mt-4 space-y-2">
              <textarea
                className="input"
                rows={3}
                placeholder="Write a reply..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              {replyFiles.length > 0 && (
                <ul className="space-y-1">
                  {replyFiles.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs dark:bg-slate-800/60">
                      <span>{f.name}</span>
                      <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => setReplyFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between">
                <label className="btn-secondary inline-flex cursor-pointer items-center gap-2">
                  <Paperclip size={15} /> Attach File
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      setReplyFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  className="btn-primary"
                  disabled={!reply.trim() || commentMutation.isPending}
                  onClick={() => commentMutation.mutate()}
                >
                  <Send size={15} /> Send Reply
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold">Activity History</h3>
          <div className="space-y-2 border-l border-slate-200 pl-4 dark:border-slate-800">
            {(ticket.activity ?? []).map((a) => (
              <div key={a.id} className="text-xs">
                <span className="text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>{' '}
                <span className="text-slate-600 dark:text-slate-400">{activityLabel(a)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={assigneesModalOpen}
        onClose={() => setAssigneesModalOpen(false)}
        title="Manage Assignees"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAssigneesModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={pendingAssignees.length === 0 || assigneesMutation.isPending}
              onClick={() => assigneesMutation.mutate(pendingAssignees)}
            >
              Save
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Adding a user does not remove any existing assignee — uncheck someone to remove them.
        </p>
        <MultiSelect options={userOptions} selected={pendingAssignees} onChange={setPendingAssignees} placeholder="Select assignees..." />
      </Modal>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Ticket"
        message={`Permanently delete ticket ${ticket.ticketNo}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          deleteMutation.mutate();
        }}
      />
    </div>
  );
}
