import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileDown, Search } from 'lucide-react';
import { BankReconciliation, GeneratedReconciliationStatement, bankReconciliationApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { useBankAccountOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';
import { exportBankReconciliationExcel } from '../utils/bankReconciliationExcel';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtMoney(value: number) {
  return `₹${(value || 0).toLocaleString('en-IN')}`;
}
function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

function monthBounds(month: number, year: number): { from: string; to: string } {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function BankReconciliationPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const bankAccountOptions = useBankAccountOptions();

  const [bankAccountId, setBankAccountId] = useState('');
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [statement, setStatement] = useState<GeneratedReconciliationStatement | null>(null);
  const [generatedPeriod, setGeneratedPeriod] = useState<{ from: string; to: string } | null>(null);
  const [txTab, setTxTab] = useState<'receipts' | 'payments'>('receipts');

  const [bankStatementBalance, setBankStatementBalance] = useState('');
  const [bankStatementDate, setBankStatementDate] = useState('');
  const [bankStatementRemarks, setBankStatementRemarks] = useState('');
  const [remarks, setRemarks] = useState('');

  const [historyAccountFilter, setHistoryAccountFilter] = useState('');

  const { data: history } = useQuery({
    queryKey: ['bank-reconciliation-history', historyAccountFilter],
    queryFn: () => bankReconciliationApi.history({ bankAccountId: historyAccountFilter || undefined, pageSize: 50 }),
  });

  const resolvePeriod = () => {
    if (periodFrom && periodTo) return { from: periodFrom, to: periodTo };
    return monthBounds(Number(month), Number(year));
  };

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!bankAccountId) throw new Error('Select a bank account');
      const { from, to } = resolvePeriod();
      return bankReconciliationApi.generate({ bankAccountId, periodFrom: from, periodTo: to });
    },
    onSuccess: (result) => {
      setStatement(result);
      setGeneratedPeriod(resolvePeriod());
      setBankStatementBalance('');
      setBankStatementDate('');
      setBankStatementRemarks('');
      setRemarks('');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!statement || !generatedPeriod) throw new Error('Generate a statement first');
      if (bankAccountId === 'BOTH') throw new Error('Select one specific bank account to save a reconciliation');
      if (bankStatementBalance === '') throw new Error('Enter the Bank Statement Closing Balance');
      return bankReconciliationApi.save({
        bankAccountId,
        periodFrom: generatedPeriod.from,
        periodTo: generatedPeriod.to,
        bankStatementBalance: Number(bankStatementBalance),
        bankStatementDate: bankStatementDate || undefined,
        bankStatementRemarks: bankStatementRemarks.trim() || undefined,
        remarks: remarks.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Reconciliation saved to history');
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation-history'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleExport = async () => {
    if (!statement || !generatedPeriod) return;
    await exportBankReconciliationExcel(
      statement,
      generatedPeriod.from,
      generatedPeriod.to,
      bankStatementBalance !== '' ? Number(bankStatementBalance) : undefined,
      bankStatementDate || undefined
    );
  };

  const difference = statement && bankStatementBalance !== '' ? Math.round((statement.closingBookBalance - Number(bankStatementBalance)) * 100) / 100 : null;
  const isReconciled = difference !== null && Math.abs(difference) < 0.01;

  return (
    <div>
      <PageHeader
        title="Bank Reconciliation"
        description="Compare the HR App's recorded bank transactions against the actual bank statement"
      />

      <div className="card mb-6 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label">Bank Account *</label>
            <select className="input" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              <option value="">Select Account</option>
              <option value="BOTH">Both Accounts (combined)</option>
              {bankAccountOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Month</label>
            <select className="input" value={month} onChange={(e) => setMonth(e.target.value)} disabled={Boolean(periodFrom && periodTo)}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <input type="number" className="input" value={year} onChange={(e) => setYear(e.target.value)} disabled={Boolean(periodFrom && periodTo)} />
          </div>
          <div>
            <label className="label">Date From (override)</label>
            <input type="date" className="input" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Date To (override)</label>
            <input type="date" className="input" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <button className="btn-primary" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
            <Search size={16} /> Generate Statement
          </button>
        </div>
      </div>

      {statement && generatedPeriod && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Opening Balance" value={fmtMoney(statement.openingBalance)} icon={FileDown} />
            <StatCard label="Total Receipts" value={fmtMoney(statement.totalReceipts)} icon={FileDown} accent="emerald" />
            <StatCard label="Total Payments" value={fmtMoney(statement.totalPayments)} icon={FileDown} accent="amber" />
            <StatCard label="Closing Book Balance" value={fmtMoney(statement.closingBookBalance)} icon={FileDown} />
          </div>
          {statement.netTransfers !== 0 && (
            <p className="mb-4 text-xs text-slate-400">
              Includes {fmtMoney(statement.netTransfers)} net internal transfers (not counted as business income/expense, but affects this account's own balance).
            </p>
          )}
          {statement.combined && (
            <div className="card mb-6 overflow-x-auto p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Per-Account Breakdown</p>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-4">Account</th>
                    <th className="py-1.5 pr-4">Opening</th>
                    <th className="py-1.5 pr-4">Receipts</th>
                    <th className="py-1.5 pr-4">Payments</th>
                    <th className="py-1.5 pr-4">Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {statement.accounts.map((a) => (
                    <tr key={a.bankAccount.id}>
                      <td className="py-1.5 pr-4">{a.bankAccount.bankName} ({a.bankAccount.accountType})</td>
                      <td className="py-1.5 pr-4">{fmtMoney(a.openingBalance)}</td>
                      <td className="py-1.5 pr-4">{fmtMoney(a.totalReceipts)}</td>
                      <td className="py-1.5 pr-4">{fmtMoney(a.totalPayments)}</td>
                      <td className="py-1.5 pr-4">{fmtMoney(a.closingBookBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card mb-6 p-4">
            <p className="mb-3 text-sm font-semibold">Actual Bank Statement Balance</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Bank Statement Closing Balance *</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  disabled={!can('BANK_ACCOUNTS', 'edit')}
                  value={bankStatementBalance}
                  onChange={(e) => setBankStatementBalance(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Bank Statement Date</label>
                <input
                  type="date"
                  className="input"
                  disabled={!can('BANK_ACCOUNTS', 'edit')}
                  value={bankStatementDate}
                  onChange={(e) => setBankStatementDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Reference / Remarks</label>
                <input
                  className="input"
                  disabled={!can('BANK_ACCOUNTS', 'edit')}
                  value={bankStatementRemarks}
                  onChange={(e) => setBankStatementRemarks(e.target.value)}
                />
              </div>
            </div>

            {difference !== null && (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div>
                  <p className="text-xs text-slate-400">Reconciliation Difference</p>
                  <p className={`text-lg font-bold ${isReconciled ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{fmtMoney(difference)}</p>
                </div>
                <Badge value={isReconciled ? 'RECONCILED' : 'RECONCILIATION_REQUIRED'} label={isReconciled ? 'RECONCILED' : 'RECONCILIATION REQUIRED'} />
              </div>
            )}

            <div className="mt-4">
              <label className="label">Notes</label>
              <textarea className="input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={!can('BANK_ACCOUNTS', 'edit')} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {can('BANK_ACCOUNTS', 'add') && (
                <button className="btn-primary" disabled={saveMutation.isPending || bankAccountId === 'BOTH'} onClick={() => saveMutation.mutate()}>
                  Save to History
                </button>
              )}
              <button className="btn-secondary" onClick={handleExport}>
                <FileDown size={16} /> Export Excel
              </button>
            </div>
            {bankAccountId === 'BOTH' && <p className="mt-2 text-xs text-slate-400">Select one specific account to save a reconciliation record.</p>}
          </div>

          <div className="card mb-6 overflow-hidden">
            <div className="flex gap-2 border-b border-slate-200 px-4 pt-3 dark:border-slate-800">
              <button
                className={`px-3 py-2 text-sm font-medium ${txTab === 'receipts' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-slate-500'}`}
                onClick={() => setTxTab('receipts')}
              >
                Receipts ({statement.receipts.length})
              </button>
              <button
                className={`px-3 py-2 text-sm font-medium ${txTab === 'payments' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-slate-500'}`}
                onClick={() => setTxTab('payments')}
              >
                Payments ({statement.payments.length})
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Project</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Remarks</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Bank Account</th>
                    <th className="px-3 py-2">Source Module</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {statement[txTab].length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-center text-slate-400">
                        No {txTab} in this period.
                      </td>
                    </tr>
                  ) : (
                    statement[txTab].map((t) => (
                      <tr key={t.id}>
                        <td className="px-3 py-2">{fmtDate(t.transactionDate)}</td>
                        <td className="px-3 py-2">{t.project?.projectNumber ?? t.project?.projectName ?? '—'}</td>
                        <td className="px-3 py-2">{t.description}</td>
                        <td className="px-3 py-2">{t.remarks ?? '—'}</td>
                        <td className="px-3 py-2 font-medium">{fmtMoney(t.effectiveAmount)}</td>
                        <td className="px-3 py-2">{t.bankAccount ? `${t.bankAccount.bankName} – ${t.bankAccount.accountType}` : '—'}</td>
                        <td className="px-3 py-2">{t.sourceModule}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm font-semibold">Reconciliation History</p>
          <select className="input w-auto py-1 text-xs" value={historyAccountFilter} onChange={(e) => setHistoryAccountFilter(e.target.value)}>
            <option value="">All Accounts</option>
            {bankAccountOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Bank Account</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Opening</th>
                <th className="px-3 py-2">Receipts</th>
                <th className="px-3 py-2">Payments</th>
                <th className="px-3 py-2">Closing Book</th>
                <th className="px-3 py-2">Bank Statement</th>
                <th className="px-3 py-2">Difference</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reconciled By</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(history?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-4 text-center text-slate-400">
                    No reconciliation history yet.
                  </td>
                </tr>
              ) : (
                (history?.data ?? []).map((h: BankReconciliation) => (
                  <tr key={h.id}>
                    <td className="px-3 py-2">{h.bankAccount ? `${h.bankAccount.bankName} – ${h.bankAccount.accountType}` : '—'}</td>
                    <td className="px-3 py-2">{fmtDate(h.periodFrom)} – {fmtDate(h.periodTo)}</td>
                    <td className="px-3 py-2">{fmtMoney(h.openingBalance)}</td>
                    <td className="px-3 py-2">{fmtMoney(h.totalReceipts)}</td>
                    <td className="px-3 py-2">{fmtMoney(h.totalPayments)}</td>
                    <td className="px-3 py-2">{fmtMoney(h.closingBookBalance)}</td>
                    <td className="px-3 py-2">{fmtMoney(h.bankStatementBalance)}</td>
                    <td className="px-3 py-2">{fmtMoney(h.reconciliationDifference)}</td>
                    <td className="px-3 py-2">
                      <Badge value={h.reconciliationStatus} />
                    </td>
                    <td className="px-3 py-2">{h.reconciledBy?.name ?? '—'}</td>
                    <td className="px-3 py-2">{fmtDate(h.reconciledAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
