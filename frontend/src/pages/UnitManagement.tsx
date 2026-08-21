import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { ProjectUnit, projectUnitsApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';

const emptyForm = { name: '', description: '', status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' };

export default function UnitManagement() {
  const { isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();

  const [projectId, setProjectId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectUnit | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [statusTarget, setStatusTarget] = useState<ProjectUnit | null>(null);

  // Default to the first project the user can see, once options arrive.
  const effectiveProjectId = projectId || projectOptions[0]?.value || '';

  const { data: units, isLoading } = useQuery({
    queryKey: ['project-units', effectiveProjectId],
    queryFn: () => projectUnitsApi.listByProject(effectiveProjectId),
    enabled: Boolean(effectiveProjectId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project-units'] });
    queryClient.invalidateQueries({ queryKey: ['lookup-project-units'] });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };
  const openEdit = (row: ProjectUnit) => {
    setEditing(row);
    setForm({ name: row.name, description: row.description ?? '', status: row.status });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
      };
      return editing ? projectUnitsApi.update(editing.id, payload) : projectUnitsApi.create({ ...payload, projectId: effectiveProjectId });
    },
    onSuccess: () => {
      toast.success('Saved successfully');
      setModalOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (row: ProjectUnit) => projectUnitsApi.update(row.id, { status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
    onSuccess: (_res, row) => {
      toast.success(row.status === 'ACTIVE' ? 'Unit deactivated' : 'Unit activated');
      setStatusTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: Column<ProjectUnit>[] = [
    { key: 'name', header: 'Unit Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'description', header: 'Description', render: (r) => <span className="text-xs text-slate-500">{r.description ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Unit Management"
        description="Project-specific Units used by Mark Attendance and the Manpower Summary"
        actions={
          isSuperAdmin && (
            <button className="btn-primary" disabled={!effectiveProjectId} onClick={openCreate}>
              <Plus size={16} /> Add Unit
            </button>
          )
        }
      />

      <div className="card mb-4 flex items-center gap-3 p-4">
        <label className="label mb-0 whitespace-nowrap">Project</label>
        <select className="input w-auto" value={effectiveProjectId} onChange={(e) => setProjectId(e.target.value)}>
          {projectOptions.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={units ?? []}
        loading={isLoading}
        emptyLabel="No Units configured for this Project yet."
        rowActions={
          isSuperAdmin
            ? (row) => (
                <div className="flex justify-end gap-1">
                  <button className="btn-ghost p-1.5" onClick={() => openEdit(row)}>
                    <Pencil size={15} />
                  </button>
                  <button
                    className={`btn-ghost p-1.5 ${row.status === 'ACTIVE' ? 'text-red-500' : 'text-emerald-600'}`}
                    onClick={() => setStatusTarget(row)}
                    title={row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  >
                    <Power size={15} />
                  </button>
                </div>
              )
            : undefined
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Unit' : 'Add Unit'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              Save
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Unit Name *</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={statusTarget !== null}
        title={statusTarget?.status === 'ACTIVE' ? 'Deactivate Unit' : 'Activate Unit'}
        message={
          statusTarget?.status === 'ACTIVE'
            ? `Deactivate "${statusTarget?.name}"? It will no longer be selectable for new attendance entries, but existing records referencing it are unaffected.`
            : `Reactivate "${statusTarget?.name}"? It will become selectable again.`
        }
        confirmLabel={statusTarget?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        danger={statusTarget?.status === 'ACTIVE'}
        onCancel={() => setStatusTarget(null)}
        onConfirm={() => statusTarget && toggleStatusMutation.mutate(statusTarget)}
      />
    </div>
  );
}
