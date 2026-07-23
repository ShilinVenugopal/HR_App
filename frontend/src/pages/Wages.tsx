import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, Banknote, FileSpreadsheet, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { WageRecord, wagesApi, projectWagesApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { Skeleton } from '../components/common/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useEmployeeOptions, useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';

/// Project-wise wages picker — every template returned here (currently just
/// Nayara AMC) is a fully independent wages page with its own sheet
/// format. Adding a new project's template server-side makes a new card
/// appear automatically; no frontend change is needed. Every other project
/// keeps using the general wages table below, unchanged.
function ProjectWagesPicker() {
  const navigate = useNavigate();
  const { data: templates, isLoading } = useQuery({ queryKey: ['wage-templates'], queryFn: projectWagesApi.listTemplates });

  if (!isLoading && !templates?.length) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-1 text-lg font-semibold">Project-Specific Wage Sheets</h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Each project below has its own wage sheet format, upload template, and salary calculations.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        {templates?.map((t) => (
          <button
            key={t.code}
            onClick={() => navigate(`/wages/${t.code}`)}
            className="card flex items-center justify-between gap-3 p-5 text-left transition hover:border-brand-400 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                <FileSpreadsheet size={22} />
              </div>
              <div>
                <p className="font-semibold">{t.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.projectName}</p>
              </div>
            </div>
            <ArrowRight size={18} className="shrink-0 text-slate-400" />
          </button>
        ))}
      </div>
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const emptyForm = {
  employeeId: '',
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  presentDays: 26,
  overtimeHours: 0,
  basicWage: 0,
  allowances: 0,
  overtimeAmount: 0,
  pfDeduction: 0,
  esicDeduction: 0,
  advanceRecovery: 0,
  otherDeductions: 0,
};

export default function Wages() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();
  const employeeOptions = useEmployeeOptions();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ projectId: '', status: '', month: '', year: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ['wages', page, filters],
    queryFn: () => wagesApi.list({ page, pageSize: 10, ...filters }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['wages'] });

  const createMutation = useMutation({
    mutationFn: () => wagesApi.create(form as any),
    onSuccess: () => {
      toast.success('Wage record generated');
      setModalOpen(false);
      setForm(emptyForm);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => wagesApi.approve(id),
    onSuccess: () => {
      toast.success('Wage record approved');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => wagesApi.markPaid(id),
    onSuccess: () => {
      toast.success('Marked as paid');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const grossPreview = form.basicWage + form.allowances + form.overtimeAmount;
  const netPreview = grossPreview - form.pfDeduction - form.esicDeduction - form.advanceRecovery - form.otherDeductions;

  const columns: Column<WageRecord>[] = [
    { key: 'employee', header: 'Employee', render: (r) => r.employee?.name ?? '—' },
    { key: 'project', header: 'Project', render: (r) => r.project?.projectName ?? '—' },
    { key: 'period', header: 'Period', render: (r) => `${MONTHS[r.month - 1]} ${r.year}` },
    { key: 'gross', header: 'Gross', render: (r) => Number(r.grossWage).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) },
    { key: 'net', header: 'Net Salary', render: (r) => Number(r.netWage).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) },
    { key: 'status', header: 'Approval Status', render: (r) => <Badge value={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Wages" description="Monthly payroll — overtime, allowances, deductions, net salary" />

      <ProjectWagesPicker />

      <h2 className="mb-1 text-lg font-semibold">General Wages</h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">For all other projects, using the standard payroll form.</p>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        headerActions={
          can('WAGES', 'add') && (
            <button className="btn-primary" onClick={() => setModalOpen(true)}>
              <Plus size={16} /> Generate Payroll
            </button>
          )
        }
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
            <select className="input w-auto" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="PAID">Paid</option>
            </select>
          </div>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {can('WAGES', 'approve') && row.status === 'PENDING_APPROVAL' && (
              <button className="btn-ghost p-1.5 text-emerald-600" title="Approve" onClick={() => approveMutation.mutate(row.id)}>
                <Check size={15} />
              </button>
            )}
            {can('WAGES', 'approve') && row.status === 'APPROVED' && (
              <button className="btn-ghost p-1.5 text-brand-600" title="Mark Paid" onClick={() => payMutation.mutate(row.id)}>
                <Banknote size={15} />
              </button>
            )}
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Generate Payroll"
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              Generate
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className="label">Employee *</label>
            <select className="input" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
              <option value="">Select employee</option>
              {employeeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Month</label>
            <select className="input" value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: Number(e.target.value) }))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <input type="number" className="input" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Present Days</label>
            <input type="number" className="input" value={form.presentDays} onChange={(e) => setForm((f) => ({ ...f, presentDays: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Basic Wage</label>
            <input type="number" className="input" value={form.basicWage} onChange={(e) => setForm((f) => ({ ...f, basicWage: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Allowances</label>
            <input type="number" className="input" value={form.allowances} onChange={(e) => setForm((f) => ({ ...f, allowances: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Overtime Hours</label>
            <input type="number" className="input" value={form.overtimeHours} onChange={(e) => setForm((f) => ({ ...f, overtimeHours: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Overtime Amount</label>
            <input type="number" className="input" value={form.overtimeAmount} onChange={(e) => setForm((f) => ({ ...f, overtimeAmount: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">PF Deduction</label>
            <input type="number" className="input" value={form.pfDeduction} onChange={(e) => setForm((f) => ({ ...f, pfDeduction: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">ESIC Deduction</label>
            <input type="number" className="input" value={form.esicDeduction} onChange={(e) => setForm((f) => ({ ...f, esicDeduction: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Advance Recovery</label>
            <input type="number" className="input" value={form.advanceRecovery} onChange={(e) => setForm((f) => ({ ...f, advanceRecovery: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Other Deductions</label>
            <input type="number" className="input" value={form.otherDeductions} onChange={(e) => setForm((f) => ({ ...f, otherDeductions: Number(e.target.value) }))} />
          </div>
        </div>

        <div className="mt-4 flex justify-between rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-800/50">
          <span>
            Gross Wage: <strong>₹{grossPreview.toLocaleString('en-IN')}</strong>
          </span>
          <span>
            Net Salary: <strong>₹{netPreview.toLocaleString('en-IN')}</strong>
          </span>
        </div>
      </Modal>
    </div>
  );
}
