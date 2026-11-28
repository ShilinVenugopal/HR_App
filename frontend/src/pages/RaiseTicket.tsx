import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Paperclip, X } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { MultiSelect } from '../components/common/MultiSelect';
import { CreateTicketInput, ticketsApi, uploadsApi } from '../api/modules';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAssignableUserOptions, useTicketCategoryOptions } from '../hooks/useLookups';
import { ALL_MODULES, MODULE_LABELS } from '../types';

const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const MODULE_OPTIONS = ALL_MODULES.filter((m) => m !== 'TICKETS');

export default function RaiseTicket() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const categoryOptions = useTicketCategoryOptions();
  const userOptions = useAssignableUserOptions();

  const [moduleName, setModuleName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITY_OPTIONS)[number]>('MEDIUM');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: CreateTicketInput = {
        module: moduleName || null,
        categoryId,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        assigneeIds,
      };
      const res = await ticketsApi.create(payload);
      const ticket = res.data;

      for (const file of files) {
        try {
          const uploaded = await uploadsApi.upload(file);
          await ticketsApi.attachFile(ticket.id, {
            fileName: file.name,
            filePath: uploaded.url,
            fileSize: file.size,
            mimeType: file.type || undefined,
          });
        } catch {
          toast.error(`Could not attach "${file.name}" — the ticket was still created`);
        }
      }

      return res;
    },
    onSuccess: (res) => {
      toast.success(`Ticket ${res.data.ticketNo} has been created successfully.`);
      navigate(`/tickets/${res.data.id}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not create ticket')),
  });

  const validate = () => {
    const next: Record<string, string> = {};
    if (!subject.trim()) next.subject = 'Subject is required';
    if (!description.trim()) next.description = 'Description is required';
    if (!categoryId) next.categoryId = 'Category is required';
    if (!priority) next.priority = 'Priority is required';
    if (assigneeIds.length === 0) next.assigneeIds = 'At least one assignee is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    createMutation.mutate();
  };

  return (
    <div>
      <PageHeader title="Raise New Ticket" description="Report an issue, complaint, or request and assign it to the right people" />

      <div className="card max-w-3xl space-y-4 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Raised By</label>
            <p className="font-medium">{session?.user.name}</p>
          </div>
          <div>
            <label className="label">Date</label>
            <p className="font-medium">{new Date().toLocaleDateString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Module</label>
            <select className="input" value={moduleName} onChange={(e) => setModuleName(e.target.value)}>
              <option value="">Select module (optional)...</option>
              {MODULE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {MODULE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Category *</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select category...</option>
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            {errors.categoryId && <p className="mt-1 text-xs text-red-500">{errors.categoryId}</p>}
            {!errors.categoryId && categoryOptions.length === 0 && (
              <p className="mt-1 text-xs text-amber-500">
                No ticket categories are set up yet. Ask a Super Admin to add one in Settings &rarr; Ticket Categories.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="label">Subject *</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary of the issue" />
          {errors.subject && <p className="mt-1 text-xs text-red-500">{errors.subject}</p>}
        </div>

        <div>
          <label className="label">Description *</label>
          <textarea
            className="input"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue in detail"
          />
          {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description}</p>}
        </div>

        <div>
          <label className="label">Priority *</label>
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Assign To *</label>
          <MultiSelect
            options={userOptions}
            selected={assigneeIds}
            onChange={setAssigneeIds}
            placeholder="Select one or more users..."
          />
          {errors.assigneeIds && <p className="mt-1 text-xs text-red-500">{errors.assigneeIds}</p>}
        </div>

        <div>
          <label className="label">Attachment (optional)</label>
          <label className="btn-secondary inline-flex cursor-pointer items-center gap-2">
            <Paperclip size={15} />
            Choose Files
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                setFiles((prev) => [...prev, ...selected]);
                e.target.value = '';
              }}
            />
          </label>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs dark:bg-slate-800/60">
                  <span>
                    {f.name} <span className="text-slate-400">({(f.size / 1024).toFixed(0)} KB)</span>
                  </span>
                  <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button className="btn-primary" disabled={createMutation.isPending} onClick={handleSubmit}>
            {createMutation.isPending ? 'Submitting...' : 'Submit Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}
