import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Eye, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  CONTRACTING_TYPE_OPTIONS,
  ContractingType,
  MSME_TYPE_OPTIONS,
  MSMEType,
  Subcontractor,
  subcontractorsApi,
} from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';

const emptyForm = {
  companyName: '',
  contactPerson: '',
  address: '',
  gstNumber: '',
  panNumber: '',
  msmeAvailable: false,
  msmeNumber: '',
  msmeType: '' as MSMEType | '',
  contactNumber: '',
  email: '',
  bankAccountNumber: '',
  bankName: '',
  ifscCode: '',
  contractingType: '' as ContractingType | '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
};

type ModalMode = 'add' | 'edit' | 'view';

export default function SubcontractorManagement() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canAdd = can('SUBCONTRACTORS', 'add');
  const canEdit = can('SUBCONTRACTORS', 'edit');
  const canDelete = can('SUBCONTRACTORS', 'delete');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [contractingTypeFilter, setContractingTypeFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [editing, setEditing] = useState<Subcontractor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Subcontractor | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['subcontractors', page, search, contractingTypeFilter],
    queryFn: () => subcontractorsApi.list({ page, pageSize: 10, search, contractingType: contractingTypeFilter || undefined }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['subcontractors'] });
    queryClient.invalidateQueries({ queryKey: ['subcontractor-options'] });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalMode('add');
    setModalOpen(true);
  };

  const fillForm = (row: Subcontractor) =>
    setForm({
      companyName: row.companyName,
      contactPerson: row.contactPerson ?? '',
      address: row.address ?? '',
      gstNumber: row.gstNumber ?? '',
      panNumber: row.panNumber ?? '',
      msmeAvailable: row.msmeAvailable,
      msmeNumber: row.msmeNumber ?? '',
      msmeType: row.msmeType ?? '',
      contactNumber: row.contactNumber,
      email: row.email ?? '',
      bankAccountNumber: row.bankAccountNumber,
      bankName: row.bankName,
      ifscCode: row.ifscCode,
      contractingType: row.contractingType,
      status: row.status,
    });

  const openEdit = (row: Subcontractor) => {
    setEditing(row);
    fillForm(row);
    setModalMode('edit');
    setModalOpen(true);
  };
  const openView = (row: Subcontractor) => {
    setEditing(row);
    fillForm(row);
    setModalMode('view');
    setModalOpen(true);
  };

  const buildPayload = () => ({
    companyName: form.companyName.trim(),
    contactPerson: form.contactPerson.trim() || undefined,
    address: form.address.trim() || undefined,
    gstNumber: form.gstNumber.trim() || undefined,
    panNumber: form.panNumber.trim() || undefined,
    msmeAvailable: form.msmeAvailable,
    msmeNumber: form.msmeAvailable ? form.msmeNumber.trim() || undefined : undefined,
    msmeType: form.msmeAvailable && form.msmeType ? form.msmeType : undefined,
    contactNumber: form.contactNumber.trim(),
    email: form.email.trim() || undefined,
    bankAccountNumber: form.bankAccountNumber.trim(),
    bankName: form.bankName.trim(),
    ifscCode: form.ifscCode.trim(),
    contractingType: form.contractingType || undefined,
    status: form.status,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      return editing ? subcontractorsApi.update(editing.id, payload) : subcontractorsApi.create(payload);
    },
    onSuccess: () => {
      toast.success('Subcontractor saved successfully');
      setModalOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => subcontractorsApi.remove(id),
    onSuccess: () => {
      toast.success('Subcontractor deleted');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err));
      setDeleteTarget(null);
    },
  });

  const validateAndSave = () => {
    if (!form.companyName.trim() || !form.contactNumber.trim()) {
      toast.error('Company Name and Contact Number are mandatory.');
      return;
    }
    if (!form.bankAccountNumber.trim() || !form.bankName.trim() || !form.ifscCode.trim()) {
      toast.error('Bank Account Number, Bank Name and IFSC Code are mandatory.');
      return;
    }
    if (!form.contractingType) {
      toast.error('Contracting Type is mandatory.');
      return;
    }
    if (form.msmeAvailable && (!form.msmeNumber.trim() || !form.msmeType)) {
      toast.error('MSME Number and MSME Type are required when MSME Available is Yes.');
      return;
    }
    saveMutation.mutate();
  };

  const columns: Column<Subcontractor>[] = [
    { key: 'companyName', header: 'Company Name', render: (r) => <span className="font-medium">{r.companyName}</span> },
    { key: 'contactPerson', header: 'Contact Person', render: (r) => r.contactPerson ?? '—' },
    { key: 'contactNumber', header: 'Contact Number', render: (r) => r.contactNumber },
    {
      key: 'contractingType',
      header: 'Contracting Type',
      render: (r) => CONTRACTING_TYPE_OPTIONS.find((o) => o.value === r.contractingType)?.label ?? r.contractingType,
    },
    { key: 'gstNumber', header: 'GST No.', render: (r) => r.gstNumber ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
  ];

  const isReadOnly = modalMode === 'view';

  return (
    <div>
      <PageHeader
        title="Subcontractor Management"
        description="Register and maintain subcontractor company details used across month-wise subcontractor billing"
        actions={
          canAdd && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> Add New Subcontractor
            </button>
          )
        }
      />

      <div className="card mb-6 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Contracting Type</label>
            <select className="input" value={contractingTypeFilter} onChange={(e) => { setContractingTypeFilter(e.target.value); setPage(1); }}>
              <option value="">All Types</option>
              {CONTRACTING_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={search}
        searchPlaceholder="Search by Company Name..."
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <button className="btn-ghost p-1.5" onClick={() => openView(row)} title="View">
              <Eye size={15} />
            </button>
            {canEdit && (
              <button className="btn-ghost p-1.5" onClick={() => openEdit(row)} title="Edit">
                <Pencil size={15} />
              </button>
            )}
            {canDelete && (
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteTarget(row)} title="Delete">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === 'add' ? 'Add New Subcontractor' : modalMode === 'edit' ? 'Edit Subcontractor' : 'Subcontractor Details'}
        size="lg"
        footer={
          isReadOnly ? (
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Close
            </button>
          ) : (
            <>
              <button className="btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" disabled={saveMutation.isPending} onClick={validateAndSave}>
                Save Subcontractor
              </button>
            </>
          )
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Company Name *</label>
              <input className="input" disabled={isReadOnly} value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
            </div>
            <div>
              <label className="label">Contact Person Name</label>
              <input className="input" disabled={isReadOnly} value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Address</label>
            <textarea className="input" rows={2} disabled={isReadOnly} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">GST Number</label>
              <input className="input" disabled={isReadOnly} value={form.gstNumber} onChange={(e) => setForm((f) => ({ ...f, gstNumber: e.target.value }))} />
            </div>
            <div>
              <label className="label">PAN Number</label>
              <input className="input" disabled={isReadOnly} value={form.panNumber} onChange={(e) => setForm((f) => ({ ...f, panNumber: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Contact Number *</label>
              <input className="input" disabled={isReadOnly} value={form.contactNumber} onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))} />
            </div>
            <div>
              <label className="label">Email ID</label>
              <input type="email" className="input" disabled={isReadOnly} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Contracting Type *</label>
            <select
              className="input"
              disabled={isReadOnly}
              value={form.contractingType}
              onChange={(e) => setForm((f) => ({ ...f, contractingType: e.target.value as ContractingType }))}
            >
              <option value="">Select Contracting Type</option>
              {CONTRACTING_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">MSME Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">MSME Available *</label>
                <select
                  className="input"
                  disabled={isReadOnly}
                  value={form.msmeAvailable ? 'YES' : 'NO'}
                  onChange={(e) => setForm((f) => ({ ...f, msmeAvailable: e.target.value === 'YES', msmeNumber: e.target.value === 'YES' ? f.msmeNumber : '', msmeType: e.target.value === 'YES' ? f.msmeType : '' }))}
                >
                  <option value="NO">No</option>
                  <option value="YES">Yes</option>
                </select>
              </div>
              {form.msmeAvailable && (
                <>
                  <div>
                    <label className="label">MSME Number *</label>
                    <input className="input" disabled={isReadOnly} value={form.msmeNumber} onChange={(e) => setForm((f) => ({ ...f, msmeNumber: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">MSME Type *</label>
                    <select className="input" disabled={isReadOnly} value={form.msmeType} onChange={(e) => setForm((f) => ({ ...f, msmeType: e.target.value as MSMEType }))}>
                      <option value="">Select MSME Type</option>
                      {MSME_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Banking Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Bank Account Number *</label>
                <input className="input" disabled={isReadOnly} value={form.bankAccountNumber} onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))} />
              </div>
              <div>
                <label className="label">Bank Name *</label>
                <input className="input" disabled={isReadOnly} value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} />
              </div>
              <div>
                <label className="label">IFSC Code *</label>
                <input className="input" disabled={isReadOnly} value={form.ifscCode} onChange={(e) => setForm((f) => ({ ...f, ifscCode: e.target.value }))} />
              </div>
            </div>
          </div>

          {!isReadOnly && editing && (
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Subcontractor"
        message={`Delete "${deleteTarget?.companyName}"? If this subcontractor has billing or payment records, deletion will be blocked — set it to Inactive instead. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
