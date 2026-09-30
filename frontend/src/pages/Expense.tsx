import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Eraser, X, Eye, Pencil, Trash2, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { Expense as ExpenseRecord, expensesApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';
import { UNIT_OPTIONS, unitLabel } from '../utils/inventoryExcel';
import { exportExpensesExcel } from '../utils/expenseExcel';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - 3 + i);

/// One entry per optional monetary column, in the reference template's
/// exact column order (Column H through Column W). Labels correct only
/// obvious spelling/spacing slips in the source file (e.g. "Accomodation"
/// -> "Accommodation", the doubled space in "ESIC  (4.75 %)") — the
/// meaning of every column is unchanged.
const TOTAL_AMOUNT_FIELDS: { key: keyof AmountForm; label: string; mandatory?: boolean }[] = [
  { key: 'totalManpowerNetSalary', label: 'Total manpower Net Salary', mandatory: true },
  { key: 'leavePay', label: 'Leave Pay (5.77% @ Total)' },
  { key: 'bonus', label: 'Bonus (8.33% @ Total)' },
  { key: 'pf', label: 'PF (12.5% of Total)' },
  { key: 'esic', label: 'ESIC (4.75%)' },
  { key: 'transportation', label: 'Transportation' },
  { key: 'accommodation', label: 'Accommodation' },
  { key: 'operationalCost', label: 'Operational Cost' },
  { key: 'labLicenseBgFund', label: 'Lab Lic., BG, GJ Lab. Fund' },
  { key: 'ppe', label: 'PPE' },
  { key: 'coverall', label: 'Coverall' },
  { key: 'medicalExpense', label: 'Medical Exp.' },
  { key: 'toolsAndMachinery', label: 'Tools & Machinery' },
  { key: 'mobDemobCost', label: 'Mob. & Demob. Cost' },
  { key: 'insurance', label: 'Insurance (0.5%)' },
  { key: 'consumables', label: 'Consumables' },
  { key: 'misc', label: 'Misc.' },
];

interface AmountForm {
  totalManpowerNetSalary: string;
  leavePay: string;
  bonus: string;
  pf: string;
  esic: string;
  transportation: string;
  accommodation: string;
  operationalCost: string;
  labLicenseBgFund: string;
  ppe: string;
  coverall: string;
  medicalExpense: string;
  toolsAndMachinery: string;
  mobDemobCost: string;
  insurance: string;
  consumables: string;
  misc: string;
}

const emptyAmountForm: AmountForm = {
  totalManpowerNetSalary: '',
  leavePay: '',
  bonus: '',
  pf: '',
  esic: '',
  transportation: '',
  accommodation: '',
  operationalCost: '',
  labLicenseBgFund: '',
  ppe: '',
  coverall: '',
  medicalExpense: '',
  toolsAndMachinery: '',
  mobDemobCost: '',
  insurance: '',
  consumables: '',
  misc: '',
};

const num = (v: string | number | undefined) => Number(v) || 0;

export default function Expense() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();

  // ── Entry form: Project + Year + Month drive which record loads ────────
  const [projectId, setProjectId] = useState('');
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uom, setUom] = useState('');
  const [manpower, setManpower] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [amounts, setAmounts] = useState<AmountForm>(emptyAmountForm);

  const periodReady = Boolean(projectId && year && month);

  const { data: existing } = useQuery({
    queryKey: ['expense-lookup', projectId, year, month],
    queryFn: () => expensesApi.lookup(projectId, year, month),
    enabled: periodReady,
  });

  useEffect(() => {
    if (!periodReady) return;
    if (existing) {
      setEditingId(existing.id);
      setUom(existing.uom ?? '');
      setManpower(String(existing.manpower));
      setBasicSalary(String(existing.basicSalary));
      setAmounts({
        totalManpowerNetSalary: String(existing.totalManpowerNetSalary),
        leavePay: String(existing.leavePay),
        bonus: String(existing.bonus),
        pf: String(existing.pf),
        esic: String(existing.esic),
        transportation: String(existing.transportation),
        accommodation: String(existing.accommodation),
        operationalCost: String(existing.operationalCost),
        labLicenseBgFund: String(existing.labLicenseBgFund),
        ppe: String(existing.ppe),
        coverall: String(existing.coverall),
        medicalExpense: String(existing.medicalExpense),
        toolsAndMachinery: String(existing.toolsAndMachinery),
        mobDemobCost: String(existing.mobDemobCost),
        insurance: String(existing.insurance),
        consumables: String(existing.consumables),
        misc: String(existing.misc),
      });
    } else {
      setEditingId(null);
      setUom('');
      setManpower('');
      setBasicSalary('');
      setAmounts(emptyAmountForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, periodReady]);

  const liveTotalAmount = TOTAL_AMOUNT_FIELDS.reduce((sum, f) => sum + num(amounts[f.key]), 0);

  const resetForm = () => {
    setUom('');
    setManpower('');
    setBasicSalary('');
    setAmounts(emptyAmountForm);
    setEditingId(null);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['expense-lookup'] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        projectId,
        year,
        month,
        uom: (uom || undefined) as ExpenseRecord['uom'],
        manpower: num(manpower),
        basicSalary: num(basicSalary),
        ...Object.fromEntries(TOTAL_AMOUNT_FIELDS.map((f) => [f.key, num(amounts[f.key])])),
      };
      return editingId ? expensesApi.update(editingId, payload) : expensesApi.create(payload);
    },
    onSuccess: (res) => {
      toast.success(editingId ? 'Expense updated successfully' : 'Expense saved successfully');
      setEditingId(res.data.id);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleSave = () => {
    if (!projectId) return toast.error('Project is required.');
    if (!year || !month) return toast.error('Year and Month are required.');
    if (!manpower.trim() || !amounts.totalManpowerNetSalary.trim()) {
      return toast.error('Manpower and Total manpower Net Salary are mandatory fields.');
    }
    if (Number.isNaN(Number(manpower)) || Number.isNaN(Number(amounts.totalManpowerNetSalary))) {
      return toast.error('Manpower and Total manpower Net Salary must be valid numbers.');
    }
    saveMutation.mutate();
  };

  // ── Listing / search ────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [listFilters, setListFilters] = useState({ projectId: '', year: '', month: '' });
  const [viewTarget, setViewTarget] = useState<ExpenseRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null);

  const { data: list, isLoading } = useQuery({
    queryKey: ['expenses', page, listFilters],
    queryFn: () => expensesApi.list({ page, pageSize: 10, ...listFilters }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.remove(id),
    onSuccess: () => {
      toast.success('Expense record deleted');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const openEdit = (row: ExpenseRecord) => {
    setProjectId(row.projectId);
    setYear(row.year);
    setMonth(row.month);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Export to Excel ─────────────────────────────────────────────────────
  const [exportProjectId, setExportProjectId] = useState('');
  const [exportYear, setExportYear] = useState(CURRENT_YEAR);
  const [exportFromMonth, setExportFromMonth] = useState(1);
  const [exportToMonth, setExportToMonth] = useState(12);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!exportProjectId) return toast.error('Select a Project to export.');
    setExporting(true);
    try {
      const res = await expensesApi.list({
        pageSize: 500,
        projectId: exportProjectId,
        year: exportYear,
        monthFrom: exportFromMonth,
        monthTo: exportToMonth,
        sortBy: 'month',
        sortOrder: 'asc',
      });
      if (res.data.length === 0) {
        toast.error('No expense records found for the selected period.');
        return;
      }
      const projectLabel = projectOptions.find((p) => p.value === exportProjectId)?.label ?? 'Project';
      await exportExpensesExcel(res.data, projectLabel, exportYear, exportFromMonth, exportToMonth);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<ExpenseRecord>[] = [
    { key: 'project', header: 'Project', render: (r) => r.project?.projectName ?? '—' },
    { key: 'year', header: 'Year', render: (r) => r.year },
    { key: 'month', header: 'Month', render: (r) => MONTHS[r.month - 1] },
    { key: 'manpower', header: 'Manpower', render: (r) => Number(r.manpower).toLocaleString('en-IN') },
    { key: 'netSalary', header: 'Total manpower Net Salary', render: (r) => `₹${Number(r.totalManpowerNetSalary).toLocaleString('en-IN')}` },
    { key: 'totalAmount', header: 'Total Amount', render: (r) => <span className="font-semibold">₹{Number(r.totalAmount).toLocaleString('en-IN')}</span> },
    { key: 'createdBy', header: 'Created By', render: (r) => r.createdBy?.name ?? '—' },
    { key: 'createdAt', header: 'Created Date', render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—') },
    { key: 'updatedBy', header: 'Updated By', render: (r) => r.updatedBy?.name ?? '—' },
    { key: 'updatedAt', header: 'Updated Date', render: (r) => (r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—') },
  ];

  return (
    <div>
      <PageHeader title="Expense" description="Project-wise monthly expense sheet" />

      <div className="card mb-6 p-5">
        <h3 className="mb-4 text-sm font-semibold">Expense Entry</h3>
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Project *</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select project...</option>
              {projectOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Year *</label>
            <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Month *</label>
            <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!periodReady && <p className="text-sm text-slate-400">Select a Project, Year and Month to enter or view its expense record.</p>}

        {periodReady && (
          <>
            {editingId && (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                An expense record already exists for this Project, Year and Month — editing it below instead of creating a duplicate.
              </p>
            )}

            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">UOM</label>
                <select className="input" value={uom} onChange={(e) => setUom(e.target.value)}>
                  <option value="">—</option>
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Manpower *</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={manpower}
                  onChange={(e) => setManpower(e.target.value)}
                  placeholder="Headcount"
                />
              </div>
              <div>
                <label className="label">Basic Salary</label>
                <input type="number" min="0" className="input" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} />
              </div>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {TOTAL_AMOUNT_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="label">
                    {f.label} {f.mandatory && '*'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={amounts[f.key]}
                    onChange={(e) => setAmounts((a) => ({ ...a, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <div className="mb-5 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
              <span className="text-sm font-semibold">Total Amount (auto-calculated)</span>
              <span className="text-lg font-bold">₹{liveTotalAmount.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {can('EXPENSE', editingId ? 'edit' : 'add') && (
                <button className="btn-primary" disabled={saveMutation.isPending} onClick={handleSave}>
                  <Save size={16} /> {editingId ? 'Update' : 'Save'}
                </button>
              )}
              <button
                className="btn-secondary"
                onClick={() => {
                  setUom('');
                  setManpower('');
                  setBasicSalary('');
                  setAmounts(emptyAmountForm);
                }}
              >
                <Eraser size={16} /> Clear/Reset
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setProjectId('');
                  resetForm();
                }}
              >
                <X size={16} /> Cancel
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card mb-6 p-5">
        <h3 className="mb-4 text-sm font-semibold">Export to Excel</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="label">Project</label>
            <select className="input" value={exportProjectId} onChange={(e) => setExportProjectId(e.target.value)}>
              <option value="">Select project...</option>
              {projectOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <select className="input" value={exportYear} onChange={(e) => setExportYear(Number(e.target.value))}>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">From Month</label>
            <select className="input" value={exportFromMonth} onChange={(e) => setExportFromMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">To Month</label>
            <select className="input" value={exportToMonth} onChange={(e) => setExportToMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn-secondary mt-4" disabled={exporting} onClick={handleExport}>
          <FileDown size={16} /> Export to Excel
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={list?.data ?? []}
        loading={isLoading}
        meta={list?.meta}
        onPageChange={setPage}
        filters={
          <div className="flex flex-wrap gap-2">
            <select
              className="input w-auto"
              value={listFilters.projectId}
              onChange={(e) => {
                setListFilters((f) => ({ ...f, projectId: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All Projects</option>
              {projectOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              className="input w-auto"
              value={listFilters.year}
              onChange={(e) => {
                setListFilters((f) => ({ ...f, year: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All Years</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              className="input w-auto"
              value={listFilters.month}
              onChange={(e) => {
                setListFilters((f) => ({ ...f, month: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All Months</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <button className="btn-ghost p-1.5" onClick={() => setViewTarget(row)} title="View">
              <Eye size={15} />
            </button>
            {can('EXPENSE', 'edit') && (
              <button className="btn-ghost p-1.5" onClick={() => openEdit(row)} title="Edit">
                <Pencil size={15} />
              </button>
            )}
            {can('EXPENSE', 'delete') && (
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteTarget(row)} title="Delete">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      />

      <Modal
        open={viewTarget !== null}
        onClose={() => setViewTarget(null)}
        title={viewTarget ? `${viewTarget.project?.projectName} — ${MONTHS[viewTarget.month - 1]} ${viewTarget.year}` : ''}
        size="lg"
      >
        {viewTarget && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-400">UOM</p>
                <p>{viewTarget.uom ? unitLabel(viewTarget.uom) : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Manpower</p>
                <p>{Number(viewTarget.manpower).toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Basic Salary</p>
                <p>₹{Number(viewTarget.basicSalary).toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TOTAL_AMOUNT_FIELDS.map((f) => (
                <div key={f.key}>
                  <p className="text-xs text-slate-400">{f.label}</p>
                  <p>₹{Number(viewTarget[f.key as keyof ExpenseRecord]).toLocaleString('en-IN')}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              <p className="text-xs text-slate-400">Total Amount</p>
              <p className="text-lg font-bold">₹{Number(viewTarget.totalAmount).toLocaleString('en-IN')}</p>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Expense Record"
        message={
          deleteTarget
            ? `Delete the expense record for "${deleteTarget.project?.projectName}" — ${MONTHS[deleteTarget.month - 1]} ${deleteTarget.year}? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
