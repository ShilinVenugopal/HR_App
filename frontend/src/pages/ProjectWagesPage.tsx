import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, FileDown, IndianRupee, MinusCircle, Plus, Printer, Search, Upload, Users, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { Skeleton } from '../components/common/Skeleton';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { WageGrid } from '../components/wages/WageGrid';
import { WageUploadModal } from '../components/wages/WageUploadModal';
import { WageHistoryModal } from '../components/wages/WageHistoryModal';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { Employee, WageColumnDef, WageEntry, employeesApi, projectWagesApi } from '../api/modules';
import { MONTHS, downloadWageTemplate, exportWagesExcel, exportWagesPdf } from '../utils/wageExcel';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

/// Maps whatever the Employee Master actually has onto matching wage-sheet
/// columns, "where possible" (per spec) — GP No., Form A, and Bank Branch
/// have no Employee Master equivalent and are always left for manual
/// entry. Only applied for keys the current template actually declares,
/// so this stays safe to reuse for a future project template with a
/// different column set.
function employeeToWageDraft(employee: Employee, columns: WageColumnDef[]): Record<string, string | number | null> {
  const hasKey = (key: string) => columns.some((c) => c.key === key);
  const draft: Record<string, string | number | null> = {};
  if (hasKey('candidateName')) draft.candidateName = employee.name;
  if (hasKey('designation')) draft.designation = employee.designation?.name ?? '';
  if (hasKey('dateOfJoining')) draft.dateOfJoining = employee.joiningDate ? employee.joiningDate.slice(0, 10) : null;
  if (hasKey('uan')) draft.uan = employee.uanNumber ?? '';
  if (hasKey('bankAccountNumber')) draft.bankAccountNumber = employee.bankAccountNumber ?? '';
  if (hasKey('bankName')) draft.bankName = employee.bankName ?? '';
  return draft;
}

export default function ProjectWagesPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [search, setSearch] = useState('');
  const [plantFilter, setPlantFilter] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<{ code: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WageEntry | null>(null);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [newRowDraft, setNewRowDraft] = useState<Record<string, string | number | null> | null>(null);
  const [savingNewRow, setSavingNewRow] = useState(false);

  const canAdd = can('WAGES', 'add');
  const canEdit = can('WAGES', 'edit');
  const canDelete = can('WAGES', 'delete');

  const { data: template, isLoading: templateLoading } = useQuery({
    queryKey: ['wage-template', code],
    queryFn: () => projectWagesApi.getTemplate(code!),
    enabled: Boolean(code),
  });

  // Search/filter/sort are applied client-side (see `visibleEntries` below)
  // since a project's whole month is already fetched in one shot for the
  // grid — searching by GP No./UAN/Bank Account and filtering by Plant/
  // Designation doesn't need a round trip, and stays instant while typing.
  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['wage-entries', code, month, year],
    queryFn: () => projectWagesApi.listEntries(code!, month, year),
    enabled: Boolean(code),
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['wage-summary', code, month, year],
    queryFn: () => projectWagesApi.getSummary(code!, month, year),
    enabled: Boolean(code),
  });

  // Employee Master lookup for the "Add from Employee Master" autofill —
  // scoped to this template's own project, matching the module's project
  // isolation rule everywhere else.
  const { data: projectEmployees } = useQuery({
    queryKey: ['project-wages-employees', template?.projectId],
    queryFn: () => employeesApi.list({ projectId: template!.projectId, pageSize: 500 }),
    enabled: Boolean(template?.projectId),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['wage-entries', code] });
    queryClient.invalidateQueries({ queryKey: ['wage-summary', code] });
  };

  const updateMutation = useMutation({
    mutationFn: ({ entry, key, value }: { entry: WageEntry; key: string; value: string | number | null }) =>
      projectWagesApi.updateEntry(code!, entry.id, { [key]: value }),
    onMutate: ({ entry }) => setSavingRowId(entry.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(['wage-entries', code, month, year], (old: typeof entriesData) =>
        old ? { ...old, entries: old.entries.map((e) => (e.id === updated.id ? updated : e)) } : old
      );
      queryClient.invalidateQueries({ queryKey: ['wage-summary', code] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not save changes')),
    onSettled: () => setSavingRowId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (entry: WageEntry) => projectWagesApi.deleteEntry(code!, entry.id),
    onSuccess: () => {
      toast.success('Row deleted');
      setDeleteTarget(null);
      invalidateAll();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const createMutation = useMutation({
    mutationFn: (values: Record<string, string | number | null>) => projectWagesApi.createEntry(code!, { month, year, values }),
    onSuccess: () => {
      toast.success('Row added');
      setNewRowDraft(null);
      invalidateAll();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not add row')),
    onSettled: () => setSavingNewRow(false),
  });

  const columns = template?.columns ?? [];
  const entries = useMemo(() => entriesData?.entries ?? [], [entriesData]);

  // Plant/Designation filters only appear when the template actually has
  // those columns (Nayara does; a future project's template might not) —
  // driven by whatever distinct values are present this month, not a
  // hardcoded list.
  const hasPlantColumn = columns.some((c) => c.key === 'plant');
  const hasDesignationColumn = columns.some((c) => c.key === 'designation');
  const plantOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => String(e.data.plant ?? '').trim()).filter(Boolean))).sort(),
    [entries]
  );
  const designationOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => String(e.data.designation ?? '').trim()).filter(Boolean))).sort(),
    [entries]
  );

  const visibleEntries = useMemo(() => {
    let result = entries;
    if (plantFilter) result = result.filter((e) => String(e.data.plant ?? '').trim() === plantFilter);
    if (designationFilter) result = result.filter((e) => String(e.data.designation ?? '').trim() === designationFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (e) =>
          e.employeeName.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q) ||
          Object.values(e.data).some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
      );
    }
    if (sort) {
      const { key, dir } = sort;
      result = [...result].sort((a, b) => {
        const av = key === 'employeeName' ? a.employeeName : (a.data[key] ?? '');
        const bv = key === 'employeeName' ? b.employeeName : (b.data[key] ?? '');
        const an = Number(av);
        const bn = Number(bv);
        const cmp = Number.isFinite(an) && Number.isFinite(bn) && av !== '' && bv !== '' ? an - bn : String(av).localeCompare(String(bv));
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [entries, plantFilter, designationFilter, search, sort]);

  if (templateLoading) {
    return (
      <div>
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!template) {
    return (
      <div>
        <PageHeader title="Wage Template Not Found" />
        <button className="btn-secondary" onClick={() => navigate('/wages')}>
          <ArrowLeft size={16} /> Back to Wages
        </button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate('/wages')} className="mb-3 flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft size={15} /> Back to Wages
      </button>
      <PageHeader title={`${template.name} — Wages`} description={`Project-specific wage sheet for ${template.projectName}`} />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Month</label>
          <select className="input w-auto" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Year</label>
          <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary" onClick={() => downloadWageTemplate(template.name, columns, month, year)}>
          <Download size={15} /> Download Template
        </button>
        {canAdd && (
          <button className="btn-secondary" onClick={() => setUploadOpen(true)}>
            <Upload size={15} /> Upload Wages
          </button>
        )}
        <button className="btn-secondary" onClick={() => exportWagesExcel(template.name, columns, entries, month, year)} disabled={!entries.length}>
          <FileDown size={15} /> Export Excel
        </button>
        <button className="btn-secondary" onClick={() => exportWagesPdf(template.name, columns, entries, month, year)} disabled={!entries.length}>
          <FileDown size={15} /> Export PDF
        </button>
        <button className="btn-secondary print:hidden" onClick={() => window.print()} disabled={!entries.length}>
          <Printer size={15} /> Print Wages
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Employees" value={summary?.totalEmployees ?? 0} icon={Users} loading={summaryLoading} />
        <StatCard
          label="Gross Salary"
          value={`₹${(summary?.grossSalary ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          icon={IndianRupee}
          loading={summaryLoading}
        />
        <StatCard
          label="Total Deductions"
          value={`₹${(summary?.totalDeductions ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          icon={MinusCircle}
          loading={summaryLoading}
          accent="amber"
        />
        <StatCard
          label="Net Salary"
          value={`₹${(summary?.netSalary ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          icon={Wallet}
          loading={summaryLoading}
          accent="emerald"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-8"
              placeholder="Search name, GP No., UAN, bank account..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {hasPlantColumn && (
            <select className="input w-auto" value={plantFilter} onChange={(e) => setPlantFilter(e.target.value)}>
              <option value="">All Plants</option>
              {plantOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
          {hasDesignationColumn && (
            <select className="input w-auto" value={designationFilter} onChange={(e) => setDesignationFilter(e.target.value)}>
              <option value="">All Designations</option>
              {designationOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>
        {canAdd && !newRowDraft && (
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                const idCol = columns.find((c) => c.isEmployeeId);
                const nameCol = columns.find((c) => c.isEmployeeName);
                setNewRowDraft({ ...(idCol ? { [idCol.key]: '' } : {}), ...(nameCol ? { [nameCol.key]: '' } : {}) });
              }}
            >
              <Plus size={15} /> Add Row
            </button>
            {Boolean(projectEmployees?.data.length) && (
              <select
                className="input w-auto"
                value=""
                onChange={(e) => {
                  const employee = projectEmployees!.data.find((emp) => emp.id === e.target.value);
                  if (employee) setNewRowDraft(employeeToWageDraft(employee, columns));
                  e.target.value = '';
                }}
              >
                <option value="">+ Add from Employee Master...</option>
                {projectEmployees!.data.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {entriesLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <WageGrid
          columns={columns}
          entries={visibleEntries}
          savingRowId={savingRowId}
          canEdit={canEdit}
          canDelete={canDelete}
          sort={sort}
          onSortChange={setSort}
          onSaveCell={(entry, key, value) => {
            if (!canEdit) return;
            updateMutation.mutate({ entry, key, value });
          }}
          onDeleteRow={(entry) => canDelete && setDeleteTarget(entry)}
          onOpenHistory={(employeeCode, employeeName) => setHistoryTarget({ code: employeeCode, name: employeeName })}
          newRowDraft={newRowDraft}
          onNewRowChange={setNewRowDraft}
          onSaveNewRow={() => {
            if (!newRowDraft) return;
            setSavingNewRow(true);
            createMutation.mutate(newRowDraft);
          }}
          onCancelNewRow={() => setNewRowDraft(null)}
          savingNewRow={savingNewRow}
        />
      )}

      <WageUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        templateCode={template.code}
        templateName={template.name}
        columns={columns}
        month={month}
        year={year}
        existingCount={entries.length}
        onImported={invalidateAll}
      />

      <WageHistoryModal
        open={Boolean(historyTarget)}
        onClose={() => setHistoryTarget(null)}
        templateCode={template.code}
        employeeCode={historyTarget?.code ?? null}
        employeeName={historyTarget?.name}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Wage Row"
        message={`Delete the wage record for "${deleteTarget?.employeeName}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
      />
    </div>
  );
}
