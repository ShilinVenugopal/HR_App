import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, FileDown, Lock, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/common/Badge';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useProjectOptions } from '../hooks/useLookups';
import { SiteAccountCostCode, SiteAccountEntryInput, siteAccountsApi } from '../api/modules';
import { apiErrorMessage } from '../api/client';
import { parseDatesText, formatDatesText } from '../utils/siteAccountDates';
import { exportSiteAccountExcel } from '../utils/siteAccountExcel';

interface ExpenseRow {
  key: string;
  costCodeId: string;
  voucherNo: string;
  datesText: string;
  paymentAmount: string;
}

interface ReceiptRow {
  key: string;
  particulars: string;
  voucherNo: string;
  datesText: string;
  receiptAmount: string;
  depositAdvanceAmount: string;
}

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `sa-row-${keyCounter}`;
}

function emptyExpenseRow(costCodeId: string): ExpenseRow {
  return { key: newKey(), costCodeId, voucherNo: '', datesText: '', paymentAmount: '' };
}

function emptyReceiptRow(): ReceiptRow {
  return { key: newKey(), particulars: '', voucherNo: '', datesText: '', receiptAmount: '', depositAdvanceAmount: '' };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function SiteAccountDetail() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();

  const [projectId, setProjectId] = useState('');
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10));
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [siteFundReceived, setSiteFundReceived] = useState('');
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [receiptRows, setReceiptRows] = useState<ReceiptRow[]>([]);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: costCodes } = useQuery({ queryKey: ['site-account-cost-codes'], queryFn: siteAccountsApi.listCostCodes });

  const { data: statement, isLoading } = useQuery({
    queryKey: ['site-account', id],
    queryFn: () => siteAccountsApi.get(id!),
    enabled: !isNew,
  });

  // A DRAFT is editable by canEdit; once SAVED, only canApprove ("correction
  // rights") may still edit it — mirrors the backend's assertCanMutateStatement.
  const isEditable =
    isNew ||
    (statement?.status === 'DRAFT' && can('SITE_ACCOUNTS', 'edit')) ||
    (statement?.status === 'SAVED' && can('SITE_ACCOUNTS', 'approve'));

  const buildRowsFromCostCodes = (codes: SiteAccountCostCode[], existingEntries: NonNullable<typeof statement>['entries'] = []) => {
    const rows: ExpenseRow[] = [];
    for (const cc of codes) {
      const matching = existingEntries.filter((e) => e.entryType === 'EXPENSE' && e.costCodeId === cc.id);
      if (matching.length === 0) {
        rows.push(emptyExpenseRow(cc.id));
      } else {
        for (const e of matching) {
          rows.push({
            key: newKey(),
            costCodeId: cc.id,
            voucherNo: e.voucherNo ?? '',
            datesText: formatDatesText(e.dates),
            paymentAmount: String(e.paymentAmount),
          });
        }
      }
    }
    return rows;
  };

  // Seed the grid with one blank, always-visible row per static cost code
  // as soon as the master loads for a brand-new statement — the static
  // structure must always be visible, per the design brief.
  useEffect(() => {
    if (isNew && costCodes && expenseRows.length === 0) {
      setExpenseRows(buildRowsFromCostCodes(costCodes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, costCodes]);

  useEffect(() => {
    if (!statement || !costCodes) return;
    setProjectId(statement.projectId);
    setStatementDate(statement.statementDate.slice(0, 10));
    setPeriodFrom(statement.periodFrom.slice(0, 10));
    setPeriodTo(statement.periodTo.slice(0, 10));
    setOpeningBalance(String(statement.openingBalance));
    setSiteFundReceived(String(statement.siteFundReceived));
    setExpenseRows(buildRowsFromCostCodes(costCodes, statement.entries));
    setReceiptRows(
      statement.entries
        .filter((e) => e.entryType === 'OTHER_RECEIPT')
        .map((e) => ({
          key: newKey(),
          particulars: e.particulars ?? '',
          voucherNo: e.voucherNo ?? '',
          datesText: formatDatesText(e.dates),
          receiptAmount: String(e.receiptAmount),
          depositAdvanceAmount: String(e.depositAdvanceAmount),
        }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statement, costCodes]);

  const groupedCodes = useMemo(() => {
    const list = costCodes ?? [];
    const topLevel = list.filter((c) => !c.parentCode);
    return topLevel.map((top) => ({ top, children: list.filter((c) => c.parentCode === top.code) }));
  }, [costCodes]);

  const rowsForCode = (costCodeId: string) => expenseRows.filter((r) => r.costCodeId === costCodeId);

  const updateExpenseRow = (key: string, patch: Partial<ExpenseRow>) =>
    setExpenseRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addExpenseRow = (costCodeId: string) => setExpenseRows((prev) => [...prev, emptyExpenseRow(costCodeId)]);

  const removeExpenseRow = (key: string) =>
    setExpenseRows((prev) => {
      const row = prev.find((r) => r.key === key);
      if (!row) return prev;
      const siblings = prev.filter((r) => r.costCodeId === row.costCodeId);
      if (siblings.length <= 1) {
        // Never remove the static row's last slot — reset it to blank instead,
        // so the static structure stays visible.
        return prev.map((r) => (r.key === key ? emptyExpenseRow(row.costCodeId) : r));
      }
      return prev.filter((r) => r.key !== key);
    });

  const addReceiptRow = () => setReceiptRows((prev) => [...prev, emptyReceiptRow()]);
  const removeReceiptRow = (key: string) => setReceiptRows((prev) => prev.filter((r) => r.key !== key));
  const updateReceiptRow = (key: string, patch: Partial<ReceiptRow>) =>
    setReceiptRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const codeById = useMemo(() => new Map((costCodes ?? []).map((c) => [c.id, c])), [costCodes]);

  const liveTotals = useMemo(() => {
    const opening = Number(openingBalance) || 0;
    const siteFund = Number(siteFundReceived) || 0;
    const otherReceipts = receiptRows.reduce((sum, r) => sum + (Number(r.receiptAmount) || 0), 0);
    const totalDepositsAdvances = round2(receiptRows.reduce((sum, r) => sum + (Number(r.depositAdvanceAmount) || 0), 0));
    const totalPayments = round2(expenseRows.reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0));
    const totalReceipts = round2(opening + siteFund + otherReceipts);
    const balanceInHand = round2(totalReceipts - totalPayments);
    return { totalReceipts, totalDepositsAdvances, totalPayments, balanceInHand };
  }, [openingBalance, siteFundReceived, receiptRows, expenseRows]);

  const liveSubtotal = (groupCode: string) => {
    const group = groupedCodes.find((g) => g.top.code === groupCode);
    if (!group) return 0;
    const codeIds = new Set([group.top.id, ...group.children.map((c) => c.id)]);
    return round2(
      expenseRows.filter((r) => codeIds.has(r.costCodeId)).reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0)
    );
  };

  const buildEntriesPayload = (): SiteAccountEntryInput[] => {
    const expenses: SiteAccountEntryInput[] = expenseRows
      .filter((r) => (Number(r.paymentAmount) || 0) > 0)
      .map((r) => ({
        entryType: 'EXPENSE',
        costCodeId: r.costCodeId,
        voucherNo: r.voucherNo.trim() || undefined,
        dates: parseDatesText(r.datesText),
        paymentAmount: Number(r.paymentAmount) || 0,
      }));
    const receipts: SiteAccountEntryInput[] = receiptRows
      .filter((r) => r.particulars.trim() && ((Number(r.receiptAmount) || 0) > 0 || (Number(r.depositAdvanceAmount) || 0) > 0))
      .map((r) => ({
        entryType: 'OTHER_RECEIPT',
        particulars: r.particulars.trim(),
        voucherNo: r.voucherNo.trim() || undefined,
        dates: parseDatesText(r.datesText),
        receiptAmount: Number(r.receiptAmount) || 0,
        depositAdvanceAmount: Number(r.depositAdvanceAmount) || 0,
      }));
    return [...receipts, ...expenses];
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('Select a Plant/Site (Project)');
      if (!periodFrom || !periodTo) throw new Error('Statement period From/To is required');
      const payload = {
        projectId,
        statementDate,
        periodFrom,
        periodTo,
        openingBalance: Number(openingBalance) || 0,
        siteFundReceived: Number(siteFundReceived) || 0,
        entries: buildEntriesPayload(),
      };
      return isNew ? siteAccountsApi.create(payload) : siteAccountsApi.update(id!, payload);
    },
    onSuccess: (res) => {
      toast.success('Saved as Draft');
      queryClient.invalidateQueries({ queryKey: ['site-accounts'] });
      if (isNew) navigate(`/site-accounts/${res.id}`, { replace: true });
      else queryClient.invalidateQueries({ queryKey: ['site-account', id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const saveStatementMutation = useMutation({
    mutationFn: () => siteAccountsApi.save(id!),
    onSuccess: () => {
      toast.success('Statement saved — it can now only be edited by a user with correction rights');
      setSaveConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['site-account', id] });
      queryClient.invalidateQueries({ queryKey: ['site-accounts'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => siteAccountsApi.remove(id!),
    onSuccess: () => {
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: ['site-accounts'] });
      navigate('/site-accounts');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (!isNew && isLoading) return <p className="text-sm text-slate-400">Loading...</p>;

  const totals = statement?.totals ?? liveTotals;
  const projectLabel = statement?.project?.projectName ?? projectOptions.find((p) => p.value === projectId)?.label ?? '';

  return (
    <div>
      <PageHeader
        title={isNew ? 'New Site Account Statement' : `Site Account Statement — ${projectLabel}`}
        description="Project-wise site account statement — receipts, deposits/advances and payments"
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button className="btn-secondary" onClick={() => navigate('/site-accounts')}>
              <ArrowLeft size={16} /> Back
            </button>
            {statement && <Badge value={statement.status} />}
            {statement?.status === 'SAVED' && !can('SITE_ACCOUNTS', 'approve') && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Lock size={13} /> Locked — correction rights required to edit
              </span>
            )}
            {!isNew && statement && (
              <>
                <button className="btn-secondary" onClick={() => window.print()}>
                  <Printer size={16} /> Print
                </button>
                <button className="btn-secondary" onClick={() => exportSiteAccountExcel(statement, costCodes ?? [])}>
                  <FileDown size={16} /> Export Excel
                </button>
              </>
            )}
            {isEditable && (
              <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                <Save size={16} /> Save Draft
              </button>
            )}
            {!isNew && statement?.status === 'DRAFT' && can('SITE_ACCOUNTS', 'edit') && (
              <button className="btn-primary" onClick={() => setSaveConfirmOpen(true)}>
                Save Statement
              </button>
            )}
            {!isNew && statement?.status === 'DRAFT' && can('SITE_ACCOUNTS', 'delete') && (
              <button className="btn-secondary text-red-600" onClick={() => setDeleteConfirmOpen(true)}>
                <Trash2 size={16} /> Delete
              </button>
            )}
          </div>
        }
      />

      <div className="card p-6">
        <div className="mb-6 border-b border-slate-200 pb-4 dark:border-slate-800">
          <p className="text-lg font-bold">Forays Innovations Pvt. Ltd.</p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Plant / Site (Project) *</label>
            {isNew ? (
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Select project...</option>
                {projectOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="font-medium">{projectLabel || '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Project No.</label>
            <p className="font-mono text-sm">{statement?.project?.projectNumber ?? '(auto — from Project Master)'}</p>
          </div>
          <div>
            <label className="label">Name of the Job</label>
            <p className="font-medium">{projectLabel || '(auto — from Project Master)'}</p>
          </div>
          <div>
            <label className="label">Date *</label>
            {isEditable ? (
              <input type="date" className="input" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
            ) : (
              <p className="font-medium">{new Date(statementDate).toLocaleDateString()}</p>
            )}
          </div>
          <div>
            <label className="label">Account Statement Period From *</label>
            {isEditable ? (
              <input type="date" className="input" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            ) : (
              <p className="font-medium">{new Date(periodFrom).toLocaleDateString()}</p>
            )}
          </div>
          <div>
            <label className="label">Account Statement Period To *</label>
            {isEditable ? (
              <input type="date" className="input" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            ) : (
              <p className="font-medium">{new Date(periodTo).toLocaleDateString()}</p>
            )}
          </div>
        </div>

        <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="bg-slate-100 px-3 py-2 text-sm font-semibold dark:bg-slate-800">Receipts / Fund</div>
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
            <div>
              <label className="label">Opening Balance</label>
              {isEditable ? (
                <input type="number" min="0" step="0.01" className="input" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
              ) : (
                <p className="font-medium">₹{Number(openingBalance || 0).toLocaleString('en-IN')}</p>
              )}
            </div>
            <div>
              <label className="label">Amount Received as site fund</label>
              {isEditable ? (
                <input type="number" min="0" step="0.01" className="input" value={siteFundReceived} onChange={(e) => setSiteFundReceived(e.target.value)} />
              ) : (
                <p className="font-medium">₹{Number(siteFundReceived || 0).toLocaleString('en-IN')}</p>
              )}
            </div>
          </div>

          {(isEditable || receiptRows.length > 0) && (
            <div className="border-t border-slate-200 p-3 dark:border-slate-800">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">Other Receipts / Deposits</span>
                {isEditable && (
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={addReceiptRow}>
                    <Plus size={13} /> Add Row
                  </button>
                )}
              </div>
              {receiptRows.length === 0 && <p className="text-xs text-slate-400">No additional receipt/deposit rows.</p>}
              {receiptRows.map((row) => (
                <div key={row.key} className="mb-2 grid grid-cols-1 gap-2 rounded border border-slate-100 p-2 sm:grid-cols-6 dark:border-slate-800">
                  <input
                    className="input py-1 text-xs sm:col-span-2"
                    placeholder="Particulars"
                    value={row.particulars}
                    disabled={!isEditable}
                    onChange={(e) => updateReceiptRow(row.key, { particulars: e.target.value })}
                  />
                  <input
                    className="input py-1 text-xs"
                    placeholder="Vr. No"
                    value={row.voucherNo}
                    disabled={!isEditable}
                    onChange={(e) => updateReceiptRow(row.key, { voucherNo: e.target.value })}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input py-1 text-xs"
                    placeholder="Receipts"
                    value={row.receiptAmount}
                    disabled={!isEditable}
                    onChange={(e) => updateReceiptRow(row.key, { receiptAmount: e.target.value })}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input py-1 text-xs"
                    placeholder="Deposits/Advances"
                    value={row.depositAdvanceAmount}
                    disabled={!isEditable}
                    onChange={(e) => updateReceiptRow(row.key, { depositAdvanceAmount: e.target.value })}
                  />
                  {isEditable && (
                    <button className="btn-ghost p-1 text-red-500" onClick={() => removeReceiptRow(row.key)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Vr. No</th>
                <th className="px-2 py-1.5">Item Code</th>
                <th className="px-2 py-1.5">Date</th>
                <th className="px-2 py-1.5">Particulars</th>
                <th className="px-2 py-1.5">Receipts</th>
                <th className="px-2 py-1.5">Deposits/Advances</th>
                <th className="px-2 py-1.5">Payments</th>
                {isEditable && <th className="px-2 py-1.5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {groupedCodes.map(({ top, children }) => (
                <Fragment key={top.id}>
                  {[top, ...children].map((cc) => {
                    const rows = rowsForCode(cc.id).filter((r) => isEditable || (Number(r.paymentAmount) || 0) > 0);
                    return rows.length === 0 ? (
                      <tr key={cc.id}>
                        <td className="px-2 py-1.5">—</td>
                        <td className="px-2 py-1.5 font-medium">{cc.code}</td>
                        <td className="px-2 py-1.5">—</td>
                        <td className={cc.parentCode ? 'px-2 py-1.5 pl-6' : 'px-2 py-1.5 font-semibold'}>{cc.description}</td>
                        <td className="px-2 py-1.5">—</td>
                        <td className="px-2 py-1.5">—</td>
                        <td className="px-2 py-1.5">—</td>
                        {isEditable && <td />}
                      </tr>
                    ) : (
                      rows.map((row, idx) => (
                        <tr key={row.key}>
                          <td className="px-1 py-1">
                            {isEditable ? (
                              <input
                                className="input py-1 text-xs"
                                value={row.voucherNo}
                                onChange={(e) => updateExpenseRow(row.key, { voucherNo: e.target.value })}
                              />
                            ) : (
                              row.voucherNo || '—'
                            )}
                          </td>
                          <td className="px-2 py-1.5 font-medium">{idx === 0 ? cc.code : ''}</td>
                          <td className="px-1 py-1">
                            {isEditable ? (
                              <input
                                className="input py-1 text-xs"
                                placeholder="dd.mm.yyyy, dd.mm.yyyy"
                                value={row.datesText}
                                onChange={(e) => updateExpenseRow(row.key, { datesText: e.target.value })}
                              />
                            ) : (
                              row.datesText || '—'
                            )}
                          </td>
                          <td className={cc.parentCode ? 'px-2 py-1.5 pl-6' : 'px-2 py-1.5 font-semibold'}>{idx === 0 ? cc.description : ''}</td>
                          <td className="px-2 py-1.5">—</td>
                          <td className="px-2 py-1.5">—</td>
                          <td className="px-1 py-1">
                            {isEditable ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="input py-1 text-xs"
                                value={row.paymentAmount}
                                onChange={(e) => updateExpenseRow(row.key, { paymentAmount: e.target.value })}
                              />
                            ) : (
                              `₹${Number(row.paymentAmount || 0).toLocaleString('en-IN')}`
                            )}
                          </td>
                          {isEditable && (
                            <td className="px-1 py-1">
                              <div className="flex gap-1">
                                {idx === rows.length - 1 && (
                                  <button className="btn-ghost p-1" title="Add another voucher for this code" onClick={() => addExpenseRow(cc.id)}>
                                    <Plus size={13} />
                                  </button>
                                )}
                                <button className="btn-ghost p-1 text-red-500" onClick={() => removeExpenseRow(row.key)}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    );
                  })}
                  {top.hasSubtotal && (
                    <tr className="bg-slate-50 font-semibold dark:bg-slate-900/60">
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5">Subtotal</td>
                      <td className="px-2 py-1.5">—</td>
                      <td className="px-2 py-1.5">—</td>
                      <td className="px-2 py-1.5">
                        ₹{(statement?.subtotals?.[top.code] ?? liveSubtotal(top.code)).toLocaleString('en-IN')}
                      </td>
                      {isEditable && <td />}
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-sm space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Total Deposits/Advances (info only)</span>
              <span className="font-medium">₹{totals.totalDepositsAdvances.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-800">
              <span className="font-semibold">Total Receipts</span>
              <span className="font-semibold">₹{totals.totalReceipts.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold">Total Payments</span>
              <span className="font-semibold">₹{totals.totalPayments.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-bold dark:border-slate-800">
              <span>Balance in Hand</span>
              <span>₹{totals.balanceInHand.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {!isNew && statement && (
          <p className="mt-6 text-xs text-slate-400 print:hidden">
            Created by {statement.createdBy?.name ?? '—'} on {new Date(statement.createdAt).toLocaleString()}
            {statement.updatedBy ? ` · Last updated by ${statement.updatedBy.name}` : ''}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={saveConfirmOpen}
        title="Save Statement"
        message="Once saved, this statement can no longer be edited by the site team — only a user with correction rights can amend it afterward. Continue?"
        confirmLabel="Save Statement"
        onCancel={() => setSaveConfirmOpen(false)}
        onConfirm={() => saveStatementMutation.mutate()}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Statement"
        message="Delete this Draft statement? This cannot be undone."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          deleteMutation.mutate();
        }}
      />
    </div>
  );
}
