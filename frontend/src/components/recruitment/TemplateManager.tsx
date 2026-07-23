import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, Column } from '../common/DataTable';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Badge } from '../common/Badge';
import { apiErrorMessage } from '../../api/client';
import { CommChannel, CommunicationTemplate, communicationApi } from '../../api/modules';
import { useAuth } from '../../context/AuthContext';
import { EMAIL_TEMPLATE_CATEGORIES, PLACEHOLDER_VARIABLES, WHATSAPP_TEMPLATE_CATEGORIES } from '../../utils/communicationConstants';

const SAMPLE_CONTEXT: Record<string, string> = {
  candidate_name: 'Ramesh Kumar',
  designation: 'Site Supervisor',
  assigned_project: 'RIL Jamnagar',
  qualification: 'B.Tech Mechanical',
  experience: '3 Years',
  contact_number: '9876543210',
  email: 'ramesh.kumar@example.com',
  remarks: 'Strong communication skills',
  client_name: 'Reliance Industries Ltd',
  interview_date: '20 Jul 2026',
  interview_time: '10:30 AM',
  location: 'Site Office, Gate 2',
  recruiter_name: 'HR Executive',
};

function renderPreview(text: string): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => SAMPLE_CONTEXT[key] ?? m);
}

const emptyForm = { name: '', channel: 'EMAIL' as CommChannel, category: '', subject: '', body: '' };

export function TemplateManager() {
  const { can } = useAuth();
  const canManage = can('RECRUITMENT', 'approve');
  const queryClient = useQueryClient();

  const [channelFilter, setChannelFilter] = useState<CommChannel | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CommunicationTemplate | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [previewTemplate, setPreviewTemplate] = useState<CommunicationTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommunicationTemplate | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['comm-templates-all', channelFilter],
    queryFn: () => communicationApi.templates.list(channelFilter || undefined),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['comm-templates-all'] });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };
  const openEdit = (t: CommunicationTemplate) => {
    setEditing(t);
    setForm({ name: t.name, channel: t.channel, category: t.category ?? '', subject: t.subject ?? '', body: t.body });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => (editing ? communicationApi.templates.update(editing.id, form) : communicationApi.templates.create(form)),
    onSuccess: () => {
      toast.success(editing ? 'Template updated' : 'Template created');
      setModalOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => communicationApi.templates.duplicate(id),
    onSuccess: () => {
      toast.success('Template duplicated');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => communicationApi.templates.remove(id),
    onSuccess: () => {
      toast.success('Template deleted');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const categories = form.channel === 'EMAIL' ? EMAIL_TEMPLATE_CATEGORIES : WHATSAPP_TEMPLATE_CATEGORIES;

  const columns: Column<CommunicationTemplate>[] = [
    { key: 'name', header: 'Name', render: (t) => <span className="font-medium">{t.name}</span> },
    { key: 'channel', header: 'Channel', render: (t) => <Badge value={t.channel} /> },
    { key: 'category', header: 'Category', render: (t) => t.category ?? '—' },
    { key: 'subject', header: 'Subject', render: (t) => t.subject ?? '—' },
  ];

  return (
    <div>
      <DataTable
        columns={columns}
        rows={templates ?? []}
        loading={isLoading}
        headerActions={
          canManage && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> New Template
            </button>
          )
        }
        filters={
          <select className="input w-auto" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as CommChannel | '')}>
            <option value="">All Channels</option>
            <option value="EMAIL">Email</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
        }
        emptyLabel="No templates yet"
        rowActions={(t) => (
          <div className="flex justify-end gap-1">
            <button className="btn-ghost p-1.5" title="Preview" onClick={() => setPreviewTemplate(t)}>
              <Eye size={15} />
            </button>
            {canManage && (
              <>
                <button className="btn-ghost p-1.5" title="Edit" onClick={() => openEdit(t)}>
                  <Pencil size={15} />
                </button>
                <button className="btn-ghost p-1.5" title="Duplicate" onClick={() => duplicateMutation.mutate(t.id)}>
                  <Copy size={15} />
                </button>
                <button className="btn-ghost p-1.5 text-red-500" title="Delete" onClick={() => setDeleteTarget(t)}>
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Template' : 'New Template'}
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              Save Template
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Template Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Channel</label>
              <select
                className="input"
                value={form.channel}
                disabled={Boolean(editing)}
                onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as CommChannel }))}
              >
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              <option value="">Custom</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {form.channel === 'EMAIL' && (
            <div>
              <label className="label">Subject</label>
              <input className="input" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            </div>
          )}
          <div>
            <label className="label">Body *</label>
            <textarea
              className="input font-mono text-sm"
              rows={7}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
          </div>
          <div>
            <p className="label mb-1.5">Available placeholders</p>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDER_VARIABLES.map((v) => (
                <span key={v.key} className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {`{{${v.key}}}`}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(previewTemplate)} onClose={() => setPreviewTemplate(null)} title={`Preview — ${previewTemplate?.name ?? ''}`}>
        {previewTemplate && (
          <div className="space-y-3">
            {previewTemplate.subject && (
              <div>
                <p className="label">Subject</p>
                <p className="text-sm">{renderPreview(previewTemplate.subject)}</p>
              </div>
            )}
            <div>
              <p className="label">Message</p>
              <div className="whitespace-pre-wrap rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                {renderPreview(previewTemplate.body)}
              </div>
            </div>
            <p className="text-xs text-slate-400">Preview uses sample data — actual sends use each candidate's real details.</p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Template"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
