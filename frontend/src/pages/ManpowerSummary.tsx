import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Users, LayoutGrid, CalendarCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { manpowerSummaryApi, ManpowerSummaryUnit } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';
import { exportManpowerSummaryExcel } from '../utils/manpowerSummaryExcel';

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

export default function ManpowerSummary() {
  const projectOptions = useProjectOptions();
  const now = new Date();

  const [projectId, setProjectId] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [drillDownUnit, setDrillDownUnit] = useState<ManpowerSummaryUnit | null>(null);
  const [exporting, setExporting] = useState(false);

  const effectiveProjectId = projectId || projectOptions[0]?.value || '';

  const { data: summary, isLoading } = useQuery({
    queryKey: ['manpower-summary', effectiveProjectId, month, year],
    queryFn: () => manpowerSummaryApi.get(effectiveProjectId, month, year),
    enabled: Boolean(effectiveProjectId),
  });

  const { data: drillDownEmployees, isLoading: drillDownLoading } = useQuery({
    queryKey: ['manpower-summary-employees', effectiveProjectId, month, year, drillDownUnit?.unitId],
    queryFn: () => manpowerSummaryApi.employees(effectiveProjectId, month, year, drillDownUnit?.unitId ?? 'UNASSIGNED'),
    enabled: drillDownUnit !== null,
  });

  const handleExport = async () => {
    if (!effectiveProjectId || !summary) return;
    setExporting(true);
    try {
      const allEmployees = await manpowerSummaryApi.employees(effectiveProjectId, month, year);
      const projectLabel = projectOptions.find((p) => p.value === effectiveProjectId)?.label ?? '';
      await exportManpowerSummaryExcel(summary, allEmployees, `${projectLabel} — ${MONTHS[month - 1]} ${year}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Manpower Summary"
        description="Unit-wise distinct manpower deployed per Project for a selected month"
        actions={
          <button className="btn-secondary" disabled={exporting || !summary} onClick={handleExport}>
            <FileDown size={16} /> Export to Excel
          </button>
        }
      />

      <div className="card mb-6 flex flex-wrap items-end gap-4 p-4">
        <div>
          <label className="label">Project</label>
          <select className="input w-56" value={effectiveProjectId} onChange={(e) => setProjectId(e.target.value)}>
            {projectOptions.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Month</label>
          <select className="input w-40" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Year</label>
          <input
            type="number"
            className="input w-28"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())}
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-400">Loading summary...</p>}

      {!isLoading && summary && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total Unique Manpower" value={summary.totalUniqueManpower} icon={Users} />
            <StatCard label="Total Units" value={summary.totalUnits} icon={LayoutGrid} accent="emerald" />
            <StatCard label="Total Attendance Days" value={summary.totalAttendanceDays} icon={CalendarCheck} accent="amber" />
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-semibold">Unit</th>
                  <th className="px-5 py-3 font-semibold">Total Manpower</th>
                  <th className="px-5 py-3 font-semibold">Attendance Days</th>
                  <th className="px-5 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {summary.units.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400">
                      No attendance records found for this Project/Month/Year.
                    </td>
                  </tr>
                )}
                {summary.units.map((u) => (
                  <tr key={u.unitId ?? 'unassigned'} className="hover:bg-slate-100 dark:hover:bg-slate-800/60">
                    <td className="px-5 py-3.5">{u.unitName}</td>
                    <td className="px-5 py-3.5 font-medium">{u.manpower}</td>
                    <td className="px-5 py-3.5">{u.attendanceDays}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setDrillDownUnit(u)}>
                        <Users size={13} /> View Employees
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {summary.units.length > 0 && (
                <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold dark:border-slate-800 dark:bg-slate-900">
                  <tr>
                    <td className="px-5 py-3">Total</td>
                    <td className="px-5 py-3">{summary.totalUniqueManpower}</td>
                    <td className="px-5 py-3">{summary.totalAttendanceDays}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            "Total" above sums each Unit's distinct headcount, which can exceed the Project's overall unique manpower if an employee worked
            in more than one Unit this month — Total Unique Manpower ({summary.totalUniqueManpower}) is the de-duplicated Project-wide figure.
          </p>
        </>
      )}

      <Modal
        open={drillDownUnit !== null}
        onClose={() => setDrillDownUnit(null)}
        title={`${drillDownUnit?.unitName ?? ''} — Employee Details`}
        size="lg"
      >
        {drillDownLoading && <p className="text-sm text-slate-400">Loading...</p>}
        {!drillDownLoading && (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2 pr-3 font-semibold">Employee ID</th>
                <th className="py-2 pr-3 font-semibold">Employee Name</th>
                <th className="py-2 pr-3 font-semibold">Attendance Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(drillDownEmployees ?? []).map((e) => (
                <tr key={e.employeeId}>
                  <td className="py-2 pr-3 font-mono text-xs">{e.employeeCode}</td>
                  <td className="py-2 pr-3">{e.employeeName}</td>
                  <td className="py-2 pr-3">{e.attendanceDays}</td>
                </tr>
              ))}
              {(drillDownEmployees ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-400">
                    No employees recorded under this Unit for the selected month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}
