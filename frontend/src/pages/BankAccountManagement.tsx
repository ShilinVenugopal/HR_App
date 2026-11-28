import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { BANK_ACCOUNT_TYPE_OPTIONS, BankAccount, BankAccountType, bankAccountsApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';

const emptyForm = {
  bankName: '',
  accountHolderName: '',
  accountType: '' as BankAccountType | '',
  accountNumber: '',
  branchName: '',
  ifscCode: '',
  openingBalance: '0',
  openingBalanceDate: new Date().toISOString().slice(0, 10),
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
};

type ModalMode = 'add' | 'edit' | 'view';

function fmtMoney(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

/// Bank Account Management is Super-Admin-only throughout (req. 2) — a
/// stricter gate than the regular can('BANK_ACCOUNTS', ...) matrix used by
/// Receipts/Payments/Reconciliation, matching the backend's requireSuperAdmin.
export default function BankAccountManagement() {
  const { isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({ queryKey: ['bank-accounts'], queryFn: () => bankAccountsApi.list() });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['bank-account-options'] });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalMode('add');
    setModalOpen(true);
  };

  const fillForm = (row: BankAccount) =>
    setForm({
      bankName: row.bankName,
      accountHolderName: row.accountHolderName,
      accountType: row.accountType,
      accountNumber: row.accountNumber,
      branchName: row.branchName ?? '',
      ifscCode: row.ifscCode ?? '',
      openingBalance: String(row.openingBalance),
      openingBalanceDate: row.openingBalanceDate.slice(0, 10),
      status: row.status,
    });

  const openEdit = (row: BankAccount) => {
    setEditing(row);
    fillForm(row);
    setModalMode('edit');
    setModalOpen(true);
  };
  const openView = (row: BankAccount) => {
    setEditing(row);
    fillForm(row);
    setModalMode('view');
    setModalOpen(true);
  };

  const buildPayload = () => ({
    bankName: form.bankName.trim(),
    accountHolderName: form.accountHolderName.trim(),
    accountType: form.accountType as BankAccountType,
    accountNumber: form.accountNumber.trim(),
    branchName: form.branchName.trim() || undefined,
    ifscCode: form.ifscCode.trim() || undefined,
    openingBalance: Number(form.openingBalance) || 0,
    openingBalanceDate: form.openingBalanceDate,
    status: form.status,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      return editing ? bankAccountsApi.update(editing.id, payload) : bankAccountsApi.create(payload);
    },
    onSuccess: () => {
      toast.success('Bank account saved successfully');
      setModalOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const validateAndSave = () => {
    if (!form.bankName.trim() || !form.accountHolderName.trim() || !form.accountNumber.trim()) {
      toast.error('Bank Name, Account Holder Name and Account Number are mandatory.');
      return;
    }
    if (!form.accountType) {
      toast.error('Account Type is mandatory.');
      return;
    }
    if (!form.openingBalanceDate) {
      toast.error('Opening Balance Date is required.');
      return;
    }
    saveMutation.mutate();
  };

  const isReadOnly = modalMode === 'view';

  if (!isSuperAdmin) {
    return (
      <div className="card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Bank Account Management is accessible to the Super Admin only.
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Bank Account Management"
        description="Register company bank accounts and their opening balances — used across Billing, Subcontractor Payments, Advances, Wages and Site Accounts"
        actions={
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add Bank Account
          </button>
        }
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Bank Name</th>
                <th className="px-4 py-2.5">Account Holder</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Account Number</th>
                <th className="px-4 py-2.5">Branch</th>
                <th className="px-4 py-2.5">Opening Balance</th>
                <th className="px-4 py-2.5">Opening Date</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : (data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-400">
                    No bank accounts registered yet.
                  </td>
                </tr>
              ) : (
                (data ?? []).map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2.5 font-medium">{row.bankName}</td>
                    <td className="px-4 py-2.5">{row.accountHolderName}</td>
                    <td className="px-4 py-2.5">{BANK_ACCOUNT_TYPE_OPTIONS.find((o) => o.value === row.accountType)?.label}</td>
                    <td className="px-4 py-2.5 font-mono">{row.accountNumber}</td>
                    <td className="px-4 py-2.5">{row.branchName ?? '—'}</td>
                    <td className="px-4 py-2.5">{fmtMoney(row.openingBalance)}</td>
                    <td className="px-4 py-2.5">{new Date(row.openingBalanceDate).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">
                      <Badge value={row.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost p-1.5" onClick={() => openView(row)} title="View">
                          <Eye size={15} />
                        </button>
                        <button className="btn-ghost p-1.5" onClick={() => openEdit(row)} title="Edit">
                          <Pencil size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === 'add' ? 'Add Bank Account' : modalMode === 'edit' ? 'Edit Bank Account' : 'Bank Account Details'}
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
                Save Bank Account
              </button>
            </>
          )
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Bank Name *</label>
              <input className="input" disabled={isReadOnly} value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} />
            </div>
            <div>
              <label className="label">Account Holder Name *</label>
              <input
                className="input"
                disabled={isReadOnly}
                value={form.accountHolderName}
                onChange={(e) => setForm((f) => ({ ...f, accountHolderName: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Account Type *</label>
              <select
                className="input"
                disabled={isReadOnly}
                value={form.accountType}
                onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value as BankAccountType }))}
              >
                <option value="">Select Account Type</option>
                {BANK_ACCOUNT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Account Number *</label>
              <input
                className="input"
                disabled={isReadOnly}
                value={form.accountNumber}
                onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Branch Name</label>
              <input className="input" disabled={isReadOnly} value={form.branchName} onChange={(e) => setForm((f) => ({ ...f, branchName: e.target.value }))} />
            </div>
            <div>
              <label className="label">IFSC Code</label>
              <input className="input" disabled={isReadOnly} value={form.ifscCode} onChange={(e) => setForm((f) => ({ ...f, ifscCode: e.target.value }))} />
            </div>
          </div>
          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Opening Balance</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Opening Balance</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  disabled={isReadOnly}
                  value={form.openingBalance}
                  onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Opening Balance Date *</label>
                <input
                  type="date"
                  className="input"
                  disabled={isReadOnly}
                  value={form.openingBalanceDate}
                  onChange={(e) => setForm((f) => ({ ...f, openingBalanceDate: e.target.value }))}
                />
              </div>
            </div>
          </div>
          {!isReadOnly && editing && (
            <div>
              <label className="label">Account Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
