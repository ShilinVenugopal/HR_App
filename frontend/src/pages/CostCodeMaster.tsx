import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Power, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { CostCode, costCodesApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { exportCostCodesExcel } from '../utils/costCodeExcel';

const emptyForm = { code: '', name: '', itemsToConsider: '', remarks: '', responsiblePerson: '', status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' };

export default function CostCodeMaster() {
  const { isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CostCode | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [statusTarget, setStatusTarget] = useState<CostCode | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['cost-codes', page, search],
    queryFn: () => costCodesApi.list({ page, pageSize: 10, search }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cost-codes'] });
    queryClient.invalidateQueries({ queryKey: ['lookup-cost-codes'] });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };
  const openEdit = (row: CostCode) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      itemsToConsider: row.itemsToConsider ?? '',
      remarks: row.remarks ?? '',
      responsiblePerson: row.responsiblePerson ?? '',
      status: row.status,
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        itemsToConsider: form.itemsToConsider.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
        responsiblePerson: form.responsiblePerson.trim() || undefined,
        status: form.status,
      };
      return editing ? costCodesApi.update(editing.id, payload) : costCodesApi.create(payload);
    },
    onSuccess: () => {
      toast.success('Saved successfully');
      setModalOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (row: CostCode) => costCodesApi.update(row.id, { status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
    onSuccess: (_res, row) => {
      toast.success(row.status === 'ACTIVE' ? 'Cost Code deactivated' : 'Cost Code activated');
      setStatusTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const full = await costCodesApi.list({ page: 1, pageSize: 5000, search });
      await exportCostCodesExcel(full.data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<CostCode>[] = [
    { key: 'code', header: 'Cost Code', render: (r) => <span className="font-mono text-xs font-medium">{r.code}</span> },
    { key: 'name', header: 'Description', render: (r) => r.name },
    { key: 'itemsToConsider', header: 'Items to Consider', render: (r) => <span className="text-xs text-slate-500">{r.itemsToConsider ?? '—'}</span> },
    { key: 'remarks', header: 'Remarks', render: (r) => <span className="text-xs text-slate-500">{r.remarks ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Cost Code Master"
        description="Single source of truth for cost codes used across Inventory, Purchase Requisitions, Purchase Orders and GRN"
        actions={
          <div className="flex flex-wrap gap-2">
            {isSuperAdmin && (
              <button className="btn-primary" onClick={openCreate}>
                <Plus size={16} /> Add Cost Code
              </button>
            )}
            <button className="btn-secondary" disabled={exporting} onClick={handleExport}>
              <FileDown size={16} /> Download Excel
            </button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={search}
        searchPlaceholder="Search code or description..."
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
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
        title={editing ? 'Edit Cost Code' : 'Add Cost Code'}
        size="lg"
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Cost Code *</label>
              <input
                className="input font-mono"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Cost Code Description *</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Items to Consider</label>
            <textarea className="input" rows={2} value={form.itemsToConsider} onChange={(e) => setForm((f) => ({ ...f, itemsToConsider: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Remarks</label>
              <input className="input" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
            </div>
            <div>
              <label className="label">Responsible Person</label>
              <input className="input" value={form.responsiblePerson} onChange={(e) => setForm((f) => ({ ...f, responsiblePerson: e.target.value }))} />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={statusTarget !== null}
        title={statusTarget?.status === 'ACTIVE' ? 'Deactivate Cost Code' : 'Activate Cost Code'}
        message={
          statusTarget?.status === 'ACTIVE'
            ? `Deactivate "${statusTarget?.code}"? It will no longer be available for new Inventory/Procurement entries, but existing records referencing it are unaffected.`
            : `Reactivate "${statusTarget?.code}"? It will become available for new entries again.`
        }
        confirmLabel={statusTarget?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        danger={statusTarget?.status === 'ACTIVE'}
        onCancel={() => setStatusTarget(null)}
        onConfirm={() => statusTarget && toggleStatusMutation.mutate(statusTarget)}
      />
    </div>
  );
}
