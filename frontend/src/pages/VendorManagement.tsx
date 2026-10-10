import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Eye, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { Vendor, vendorsApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { exportVendorsExcel } from '../utils/vendorExcel';

const emptyForm = {
  name: '',
  address: '',
  productName: '',
  phone: '',
  email: '',
  gstNumber: '',
  contactPerson: '',
  bankAccountNumber: '',
  bankIfscCode: '',
  active: true,
};

type ModalMode = 'add' | 'edit' | 'view';

export default function VendorManagement() {
  const { can, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = isSuperAdmin || can('PURCHASE_ORDER', 'edit');
  const canAdd = isSuperAdmin || can('PURCHASE_ORDER', 'add');
  const canSeeBank = canEdit;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [exporting, setExporting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{ id: string; name: string; phone: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', page, search],
    queryFn: () => vendorsApi.list({ page, pageSize: 10, search }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['vendors'] });
    queryClient.invalidateQueries({ queryKey: ['lookup-vendors'] });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalMode('add');
    setModalOpen(true);
  };
  const openEdit = (row: Vendor) => {
    setEditing(row);
    setForm({
      name: row.name,
      address: row.address ?? '',
      productName: row.productName ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      gstNumber: row.gstNumber ?? '',
      contactPerson: row.contactPerson ?? '',
      bankAccountNumber: row.bankAccountNumber ?? '',
      bankIfscCode: row.bankIfscCode ?? '',
      active: row.active,
    });
    setModalMode('edit');
    setModalOpen(true);
  };
  const openView = (row: Vendor) => {
    setEditing(row);
    setForm({
      name: row.name,
      address: row.address ?? '',
      productName: row.productName ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      gstNumber: row.gstNumber ?? '',
      contactPerson: row.contactPerson ?? '',
      bankAccountNumber: row.bankAccountNumber ?? '',
      bankIfscCode: row.bankIfscCode ?? '',
      active: row.active,
    });
    setModalMode('view');
    setModalOpen(true);
  };

  const buildPayload = () => ({
    name: form.name.trim(),
    address: form.address.trim() || undefined,
    productName: form.productName.trim() || undefined,
    phone: form.phone.trim(),
    email: form.email.trim() || undefined,
    gstNumber: form.gstNumber.trim() || undefined,
    contactPerson: form.contactPerson.trim() || undefined,
    bankAccountNumber: form.bankAccountNumber.trim() || undefined,
    bankIfscCode: form.bankIfscCode.trim() || undefined,
    active: form.active,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      return editing ? vendorsApi.update(editing.id, payload) : vendorsApi.create(payload);
    },
    onSuccess: () => {
      toast.success('Saved successfully');
      setModalOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const validateAndSave = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Vendor Name and Contact Number are mandatory.');
      return;
    }
    if (!editing) {
      const match = await vendorsApi.checkDuplicate(form.name.trim(), form.phone.trim());
      if (match) {
        setDuplicateWarning(match);
        return;
      }
    }
    saveMutation.mutate();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const full = await vendorsApi.list({ page: 1, pageSize: 5000, search });
      await exportVendorsExcel(full.data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<Vendor>[] = [
    { key: 'name', header: 'Vendor Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'productName', header: 'Product', render: (r) => r.productName ?? '—' },
    { key: 'phone', header: 'Contact Number', render: (r) => r.phone ?? '—' },
    { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
    { key: 'gstNumber', header: 'GST No.', render: (r) => r.gstNumber ?? '—' },
    { key: 'active', header: 'Status', render: (r) => <Badge value={r.active ? 'ACTIVE' : 'INACTIVE'} /> },
  ];

  const isReadOnly = modalMode === 'view';

  return (
    <div>
      <PageHeader
        title="Vendor Management"
        description="Central vendor master used across Purchase Order creation — searchable by name or product"
        actions={
          <div className="flex flex-wrap gap-2">
            {canAdd && (
              <button className="btn-primary" onClick={openCreate}>
                <Plus size={16} /> Add Vendor
              </button>
            )}
            <button className="btn-secondary" disabled={exporting} onClick={handleExport}>
              <FileDown size={16} /> Export Vendors
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
        searchPlaceholder="Search by Vendor Name or Product..."
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
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === 'add' ? 'Add Vendor' : modalMode === 'edit' ? 'Edit Vendor' : 'Vendor Details'}
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
                Save Vendor
              </button>
            </>
          )
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Vendor Name *</label>
              <input
                className="input"
                disabled={isReadOnly}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Contact Number *</label>
              <input
                className="input"
                disabled={isReadOnly}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <textarea
              className="input"
              rows={2}
              disabled={isReadOnly}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Product Name</label>
              <input
                className="input"
                disabled={isReadOnly}
                value={form.productName}
                onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Contact Person</label>
              <input
                className="input"
                disabled={isReadOnly}
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Email ID</label>
              <input
                className="input"
                disabled={isReadOnly}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">GST Number</label>
              <input
                className="input"
                disabled={isReadOnly}
                value={form.gstNumber}
                onChange={(e) => setForm((f) => ({ ...f, gstNumber: e.target.value }))}
              />
            </div>
          </div>

          {canSeeBank && (
            <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Banking Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Bank Account Number</label>
                  <input
                    className="input"
                    disabled={isReadOnly}
                    value={form.bankAccountNumber}
                    onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Bank IFSC Code</label>
                  <input
                    className="input"
                    disabled={isReadOnly}
                    value={form.bankIfscCode}
                    onChange={(e) => setForm((f) => ({ ...f, bankIfscCode: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          {!isReadOnly && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
              Active
            </label>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={duplicateWarning !== null}
        title="Possible Duplicate Vendor"
        message={`A vendor with this name/contact number already exists (${duplicateWarning?.name}). Please verify before creating a new vendor. Continue anyway?`}
        confirmLabel="Continue"
        onCancel={() => setDuplicateWarning(null)}
        onConfirm={() => {
          setDuplicateWarning(null);
          saveMutation.mutate();
        }}
      />
    </div>
  );
}
