import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { ComplianceRecord, complianceApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { useEmployeeOptions, useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';

const TYPES = ['PF', 'ESIC', 'INSURANCE', 'LABOUR_LICENSE', 'MEDICAL'];

const emptyForm = {
  projectId: '',
  employeeId: '',
  type: 'PF',
  referenceNumber: '',
  validFrom: '',
  validTo: '',
  status: 'ACTIVE',
  remarks: '',
};

export default function Compliance() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();
  const employeeOptions = useEmployeeOptions();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ projectId: '', type: '', status: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ComplianceRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<ComplianceRecord | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['compliance', page, filters],
    queryFn: () => complianceApi.list({ page, pageSize: 10, ...filters }),
  });

  const { data: expiringSoon } = useQuery({
    queryKey: ['compliance-expiring'],
    queryFn: () => complianceApi.expiringSoon(30),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['compliance'] });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (row: ComplianceRecord) => {
    setEditing(row);
    setForm({
      projectId: row.projectId,
      employeeId: row.employeeId ?? '',
      type: row.type,
      referenceNumber: row.referenceNumber ?? '',
      validFrom: row.validFrom?.slice(0, 10) ?? '',
      validTo: row.validTo?.slice(0, 10) ?? '',
      status: row.status,
      remarks: row.remarks ?? '',
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, employeeId: form.employeeId || null, validFrom: form.validFrom || null, validTo: form.validTo || null };
      if (editing) return complianceApi.update(editing.id, payload);
      return complianceApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Compliance record updated' : 'Compliance record created');
      setModalOpen(false);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['compliance-expiring'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => complianceApi.remove(id),
    onSuccess: () => {
      toast.success('Compliance record deleted');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: Column<ComplianceRecord>[] = [
    { key: 'type', header: 'Type', render: (r) => r.type.replace(/_/g, ' ') },
    { key: 'project', header: 'Project', render: (r) => r.project?.projectName ?? '—' },
    { key: 'employee', header: 'Employee', render: (r) => r.employee?.name ?? 'Project-level' },
    { key: 'ref', header: 'Reference No.', render: (r) => r.referenceNumber ?? '—' },
    { key: 'validTo', header: 'Valid To', render: (r) => (r.validTo ? new Date(r.validTo).toLocaleDateString() : '—') },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Compliance"
        description="PF, ESIC, Insurance, Labour License, Medical"
        actions={
          can('COMPLIANCE', 'add') && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> Add Record
            </button>
          )
        }
      />

      {Boolean(expiringSoon?.length) && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{expiringSoon.length} compliance item(s) expiring within 30 days.</span>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        filters={
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto" value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">All Projects</option>
              {projectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className="input w-auto" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
              <option value="">All Types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {can('COMPLIANCE', 'edit') && (
              <button className="btn-ghost p-1.5" onClick={() => openEdit(row)}>
                <Pencil size={15} />
              </button>
            )}
            {can('COMPLIANCE', 'delete') && (
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteTarget(row)}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Compliance Record' : 'Add Compliance Record'}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Project *</label>
            <select className="input" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">Select</option>
              {projectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Employee (optional)</label>
            <select className="input" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
              <option value="">Project-level</option>
              {employeeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Reference Number</label>
            <input className="input" value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} />
          </div>
          <div>
            <label className="label">Valid From</label>
            <input type="date" className="input" value={form.validFrom} onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))} />
          </div>
          <div>
            <label className="label">Valid To</label>
            <input type="date" className="input" value={form.validTo} onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
              <option value="PENDING_RENEWAL">Pending Renewal</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Remarks</label>
            <textarea className="input" rows={2} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Compliance Record"
        message="Are you sure you want to delete this compliance record?"
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
