import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileDown, Plus, RotateCcw, Search, ArrowLeftRight, FileText, Wallet } from 'lucide-react';
import {
  BANK_ACCOUNT_TYPE_OPTIONS,
  BankAccountType,
  BankTransaction,
  BankSourceModule,
  SOURCE_MODULE_OPTIONS,
  bankTransactionsApi,
} from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../context/AuthContext';
import { useProjectOptions, useBankAccountOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';
import { exportBankTransactionsExcel } from '../utils/bankTransactionsExcel';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtMoney(value: number) {
  return `₹${(value || 0).toLocaleString('en-IN')}`;
}

interface Filters {
  month: string;
  year: string;
  projectId: string;
  accountType: string;
  bankAccountId: string;
  description: string;
  sourceModule: string;
}

const EMPTY_FILTERS: Filters = { month: '', year: '', projectId: '', accountType: '', bankAccountId: '', description: '', sourceModule: '' };

function EditTransactionModal({ tx, onClose }: { tx: BankTransaction | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(tx?.description ?? '');
  const [remarks, setRemarks] = useState(tx?.remarks ?? '');
  const [amount, setAmount] = useState(String(tx?.effectiveAmount ?? 0));

  const mutation = useMutation({
    mutationFn: () => bankTransactionsApi.update(tx!.id, { description: description.trim(), remarks: remarks.trim() || undefined, amount: Number(amount) }),
    onSuccess: () => {
      toast.success('Transaction updated');
      queryClient.invalidateQueries({ queryKey: ['bank-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['bank-payments'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (!tx) return null;
  return (
    <Modal
      open={tx !== null}
      onClose={onClose}
      title="Edit Transaction"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-400">Bank Account</p>
            <p className="font-medium">{tx.bankAccount ? `${tx.bankAccount.bankName} – ${tx.bankAccount.accountType}` : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Date</p>
            <p className="font-medium">{new Date(tx.transactionDate).toLocaleDateString()}</p>
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label">Remarks</label>
          <textarea className="input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <div>
          <label className="label">Amount</label>
          <input type="number" min="0" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {tx.modifiedAmount != null && (
            <p className="mt-1 text-xs text-slate-400">Originally fetched as {fmtMoney(tx.originalAmount)} from {tx.sourceModule}.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ManualEntryModal({ open, transactionType, onClose }: { open: boolean; transactionType: 'RECEIPT' | 'PAYMENT'; onClose: () => void }) {
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();
  const bankAccountOptions = useBankAccountOptions();
  const [form, setForm] = useState({ transactionDate: new Date().toISOString().slice(0, 10), bankAccountId: '', projectId: '', description: '', remarks: '', amount: '' });

  const reset = () => setForm({ transactionDate: new Date().toISOString().slice(0, 10), bankAccountId: '', projectId: '', description: '', remarks: '', amount: '' });

  const mutation = useMutation({
    mutationFn: () => {
      if (!form.bankAccountId) throw new Error('Bank Account is required');
      if (!form.description.trim()) throw new Error('Description is required');
      if (!(Number(form.amount) > 0)) throw new Error('Amount must be greater than 0');
      return bankTransactionsApi.createManual({
        transactionDate: form.transactionDate,
        bankAccountId: form.bankAccountId,
        transactionType,
        projectId: form.projectId || undefined,
        description: form.description.trim(),
        remarks: form.remarks.trim() || undefined,
        amount: Number(form.amount),
      });
    },
    onSuccess: () => {
      toast.success(`Manual ${transactionType === 'RECEIPT' ? 'receipt' : 'payment'} recorded`);
      queryClient.invalidateQueries({ queryKey: ['bank-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['bank-payments'] });
      reset();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={`Add Manual ${transactionType === 'RECEIPT' ? 'Receipt' : 'Payment'}`}
      footer={
        <>
          <button
            className="btn-secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Date *</label>
            <input type="date" className="input" value={form.transactionDate} onChange={(e) => setForm((f) => ({ ...f, transactionDate: e.target.value }))} />
          </div>
          <div>
            <label className="label">Bank Account *</label>
            <select className="input" value={form.bankAccountId} onChange={(e) => setForm((f) => ({ ...f, bankAccountId: e.target.value }))}>
              <option value="">Select Bank Account</option>
              {bankAccountOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Project Number (optional)</label>
          <select className="input" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
            <option value="">None</option>
            {projectOptions.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Description *</label>
          <input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div>
          <label className="label">Remarks</label>
          <textarea className="input" rows={2} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
        </div>
        <div>
          <label className="label">Amount *</label>
          <input type="number" min="0" step="0.01" className="input" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
        </div>
      </div>
    </Modal>
  );
}

function TransferModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const bankAccountOptions = useBankAccountOptions();
  const [form, setForm] = useState({ transactionDate: new Date().toISOString().slice(0, 10), fromAccountId: '', toAccountId: '', amount: '', description: '', remarks: '' });

  const reset = () => setForm({ transactionDate: new Date().toISOString().slice(0, 10), fromAccountId: '', toAccountId: '', amount: '', description: '', remarks: '' });

  const mutation = useMutation({
    mutationFn: () => {
      if (!form.fromAccountId || !form.toAccountId) throw new Error('From and To accounts are required');
      if (form.fromAccountId === form.toAccountId) throw new Error('From and To accounts must be different');
      if (!(Number(form.amount) > 0)) throw new Error('Amount must be greater than 0');
      return bankTransactionsApi.createTransfer({
        transactionDate: form.transactionDate,
        fromAccountId: form.fromAccountId,
        toAccountId: form.toAccountId,
        amount: Number(form.amount),
        description: form.description.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Internal transfer recorded');
      queryClient.invalidateQueries({ queryKey: ['bank-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['bank-payments'] });
      reset();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Internal Bank Transfer"
      footer={
        <>
          <button
            className="btn-secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Record Transfer
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-400">Records a debit in the From account and a credit in the To account. Never counted as business income or expense.</p>
        <div>
          <label className="label">Date *</label>
          <input type="date" className="input" value={form.transactionDate} onChange={(e) => setForm((f) => ({ ...f, transactionDate: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">From Account *</label>
            <select className="input" value={form.fromAccountId} onChange={(e) => setForm((f) => ({ ...f, fromAccountId: e.target.value }))}>
              <option value="">Select Account</option>
              {bankAccountOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">To Account *</label>
            <select className="input" value={form.toAccountId} onChange={(e) => setForm((f) => ({ ...f, toAccountId: e.target.value }))}>
              <option value="">Select Account</option>
              {bankAccountOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Amount *</label>
          <input type="number" min="0" step="0.01" className="input" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
        </div>
        <div>
          <label className="label">Description (optional)</label>
          <input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div>
          <label className="label">Remarks</label>
          <textarea className="input" rows={2} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
        </div>
      </div>
    </Modal>
  );
}

export default function BankTransactionsPage() {
  const { can } = useAuth();
  const projectOptions = useProjectOptions();
  const bankAccountOptions = useBankAccountOptions();

  const [tab, setTab] = useState<'RECEIPT' | 'PAYMENT'>('RECEIPT');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [editTx, setEditTx] = useState<BankTransaction | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const queryParams = {
    month: appliedFilters.month ? Number(appliedFilters.month) : undefined,
    year: appliedFilters.year ? Number(appliedFilters.year) : undefined,
    projectId: appliedFilters.projectId || undefined,
    accountType: (appliedFilters.accountType || undefined) as BankAccountType | undefined,
    bankAccountId: appliedFilters.bankAccountId || undefined,
    description: appliedFilters.description || undefined,
    sourceModule: (appliedFilters.sourceModule || undefined) as BankSourceModule | undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: [tab === 'RECEIPT' ? 'bank-receipts' : 'bank-payments', page, pageSize, queryParams],
    queryFn: () => (tab === 'RECEIPT' ? bankTransactionsApi.listReceipts : bankTransactionsApi.listPayments)({ page, pageSize, ...queryParams }),
  });

  const handleSearch = () => {
    setAppliedFilters(filters);
    setPage(1);
  };
  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };
  const switchTab = (t: 'RECEIPT' | 'PAYMENT') => {
    setTab(t);
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const full = await (tab === 'RECEIPT' ? bankTransactionsApi.listReceipts : bankTransactionsApi.listPayments)({ page: 1, pageSize: 5000, ...queryParams });
      await exportBankTransactionsExcel(full.data, tab === 'RECEIPT' ? 'Receipts' : 'Payments');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<BankTransaction>[] = [
    { key: 'transactionDate', header: 'Date', sortable: false, render: (r) => new Date(r.transactionDate).toLocaleDateString() },
    { key: 'bankAccount', header: 'Bank Account', render: (r) => (r.bankAccount ? `${r.bankAccount.bankName} – ${r.bankAccount.accountType}` : '—') },
    { key: 'project', header: 'Project Number', render: (r) => r.project?.projectNumber ?? r.project?.projectName ?? '—' },
    {
      key: 'description',
      header: tab === 'RECEIPT' ? 'Receipt Description' : 'Payment Description',
      render: (r) => <span>{r.description}</span>,
    },
    { key: 'remarks', header: 'Remarks', render: (r) => r.remarks ?? '—' },
    { key: 'amount', header: 'Amount', render: (r) => <span className="font-medium">{fmtMoney(r.effectiveAmount)}</span> },
    {
      key: 'sourceModule',
      header: 'Source Module',
      render: (r) => (
        <span className="flex items-center gap-1">
          {SOURCE_MODULE_OPTIONS.find((o) => o.value === r.sourceModule)?.label ?? r.sourceModule}
          {r.entryType === 'MANUAL' && <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Manual</span>}
        </span>
      ),
    },
  ];

  const rows = data?.data ?? [];
  const totalAmount = data?.meta?.totalAmount ?? 0;

  return (
    <div>
      <PageHeader
        title="Receipts & Payments"
        description="Centralized collection of all business receipts and payments across Billing, Subcontractor Payments, Advances, Wages, Site Accounts and manual entries"
        actions={
          <div className="flex flex-wrap gap-2">
            {can('BANK_ACCOUNTS', 'add') && (
              <>
                <button className="btn-primary" onClick={() => setManualOpen(true)}>
                  <Plus size={16} /> Add Manual {tab === 'RECEIPT' ? 'Receipt' : 'Payment'}
                </button>
                <button className="btn-secondary" onClick={() => setTransferOpen(true)}>
                  <ArrowLeftRight size={16} /> Internal Transfer
                </button>
              </>
            )}
            <button className="btn-secondary" disabled={exporting} onClick={handleExport}>
              <FileDown size={16} /> Export Excel
            </button>
          </div>
        }
      />

      <div className="mb-4 flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          className={`px-4 py-2 text-sm font-medium ${tab === 'RECEIPT' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-slate-500'}`}
          onClick={() => switchTab('RECEIPT')}
        >
          Receipts
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium ${tab === 'PAYMENT' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-slate-500'}`}
          onClick={() => switchTab('PAYMENT')}
        >
          Payments
        </button>
      </div>

      <div className="card mb-6 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Month</label>
            <select className="input" value={filters.month} onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))}>
              <option value="">All Months</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <input type="number" className="input" placeholder="e.g. 2026" value={filters.year} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))} />
          </div>
          <div>
            <label className="label">Project Number</label>
            <select className="input" value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">All Projects</option>
              {projectOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Account Type</label>
            <select className="input" value={filters.accountType} onChange={(e) => setFilters((f) => ({ ...f, accountType: e.target.value }))}>
              <option value="">Both / All</option>
              {BANK_ACCOUNT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Bank Account</label>
            <select className="input" value={filters.bankAccountId} onChange={(e) => setFilters((f) => ({ ...f, bankAccountId: e.target.value }))}>
              <option value="">All Accounts</option>
              {bankAccountOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={filters.description} onChange={(e) => setFilters((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="label">Source Module</label>
            <select className="input" value={filters.sourceModule} onChange={(e) => setFilters((f) => ({ ...f, sourceModule: e.target.value }))}>
              <option value="">All Sources</option>
              {SOURCE_MODULE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={handleSearch}>
            <Search size={16} /> Search
          </button>
          <button className="btn-secondary" onClick={handleReset}>
            <RotateCcw size={16} /> Clear Filters
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total Records" value={data?.meta?.total ?? 0} icon={FileText} />
        <StatCard label={`Total ${tab === 'RECEIPT' ? 'Receipts' : 'Payments'}`} value={fmtMoney(totalAmount)} icon={Wallet} accent={tab === 'RECEIPT' ? 'emerald' : 'amber'} />
      </div>

      <div className="mb-3 flex items-center justify-end gap-2 text-sm">
        <label className="text-slate-500 dark:text-slate-400">Rows per page:</label>
        <select
          className="input w-auto py-1"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        rowActions={(row) => (
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditTx(row)}>
            {can('BANK_ACCOUNTS', 'edit') ? 'Edit' : 'View'}
          </button>
        )}
      />

      <EditTransactionModal tx={editTx} onClose={() => setEditTx(null)} />
      <ManualEntryModal open={manualOpen} transactionType={tab} onClose={() => setManualOpen(false)} />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />
    </div>
  );
}
