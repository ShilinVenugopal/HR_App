import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { Skeleton } from '../components/common/Skeleton';

const TABS = [
  { key: 'manpower', label: 'Project-wise Manpower' },
  { key: 'employees', label: 'Employee Report' },
  { key: 'attendance', label: 'Attendance Report' },
  { key: 'recruitment', label: 'Recruitment Report' },
  { key: 'payroll', label: 'Payroll Report' },
  { key: 'procurementSummary', label: 'Procurement Summary' },
  { key: 'vendorSpend', label: 'Vendor Spend' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function Reports() {
  const [tab, setTab] = useState<TabKey>('manpower');

  return (
    <div>
      <PageHeader title="Reports" description="Role-based reports, scoped to your assigned projects" />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'manpower' && <ManpowerReport />}
      {tab === 'employees' && <EmployeeReport />}
      {tab === 'attendance' && <AttendanceReport />}
      {tab === 'recruitment' && <RecruitmentReport />}
      {tab === 'payroll' && <PayrollReport />}
      {tab === 'procurementSummary' && <ProcurementSummaryReport />}
      {tab === 'vendorSpend' && <VendorSpendReport />}
    </div>
  );
}

function ManpowerReport() {
  const { data, isLoading } = useQuery({ queryKey: ['report-manpower'], queryFn: reportsApi.manpower });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3">Total Headcount</th>
            <th className="px-4 py-3">Active</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {(data ?? []).map((row: any) => (
            <tr key={row.project.id}>
              <td className="px-4 py-3 font-medium">{row.project.projectName}</td>
              <td className="px-4 py-3">{row.project.clientName}</td>
              <td className="px-4 py-3">{row.total}</td>
              <td className="px-4 py-3">{row.byStatus.ACTIVE ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeReport() {
  const { data, isLoading } = useQuery({ queryKey: ['report-employees'], queryFn: reportsApi.employees });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3">Employee</th>
            <th className="px-4 py-3">Code</th>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3">Department</th>
            <th className="px-4 py-3">Designation</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {(data ?? []).map((row: any) => (
            <tr key={row.id}>
              <td className="px-4 py-3 font-medium">{row.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.employeeCode}</td>
              <td className="px-4 py-3">{row.project?.projectName ?? '—'}</td>
              <td className="px-4 py-3">{row.department?.name ?? '—'}</td>
              <td className="px-4 py-3">{row.designation?.name ?? '—'}</td>
              <td className="px-4 py-3">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceReport() {
  const { data, isLoading } = useQuery({ queryKey: ['report-attendance'], queryFn: () => reportsApi.attendance() });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold">By Status</h3>
        {(data?.byStatus ?? []).map((r: any) => (
          <div key={r.status} className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
            <span>{r.status}</span>
            <span className="font-medium">{r.count}</span>
          </div>
        ))}
      </div>
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold">By Project</h3>
        {(data?.byProject ?? []).map((r: any) => (
          <div key={r.projectId} className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
            <span>{r.projectName ?? r.projectId}</span>
            <span className="font-medium">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecruitmentReport() {
  const { data, isLoading } = useQuery({ queryKey: ['report-recruitment'], queryFn: reportsApi.recruitment });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold">Candidates by Status</h3>
      {(data?.byStatus ?? []).map((r: any) => (
        <div key={r.status} className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
          <span>{r.status.replace(/_/g, ' ')}</span>
          <span className="font-medium">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

function PayrollReport() {
  const { data, isLoading } = useQuery({ queryKey: ['report-payroll'], queryFn: () => reportsApi.payroll() });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total Gross</p>
          <p className="text-xl font-semibold">₹{Number(data?.totals?.grossWage ?? 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total Deductions</p>
          <p className="text-xl font-semibold">₹{Number(data?.totals?.deductions ?? 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total Net</p>
          <p className="text-xl font-semibold">₹{Number(data?.totals?.netWage ?? 0).toLocaleString('en-IN')}</p>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Net Salary</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data?.rows ?? []).map((row: any) => (
              <tr key={row.id}>
                <td className="px-4 py-3">{row.employee?.name}</td>
                <td className="px-4 py-3">{row.project?.projectName}</td>
                <td className="px-4 py-3">
                  {row.month}/{row.year}
                </td>
                <td className="px-4 py-3">₹{Number(row.netWage).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBreakdownCard({ title, rows }: { title: string; rows: { status: string; count: number }[] }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {rows.length === 0 && <p className="text-sm text-slate-400">No records</p>}
      {rows.map((r) => (
        <div key={r.status} className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
          <span>{r.status.replace(/_/g, ' ')}</span>
          <span className="font-medium">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

function ProcurementSummaryReport() {
  const { data, isLoading } = useQuery({ queryKey: ['report-procurement-summary'], queryFn: reportsApi.procurementSummary });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total Inventory Items</p>
          <p className="text-xl font-semibold">{data?.inventory?.totalItems ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total Working Quantity</p>
          <p className="text-xl font-semibold">{Number(data?.inventory?.totalWorkingQuantity ?? 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total Non-working Quantity</p>
          <p className="text-xl font-semibold">{Number(data?.inventory?.totalNonWorkingQuantity ?? 0).toLocaleString('en-IN')}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatusBreakdownCard title="Purchase Requisitions by Status" rows={data?.prByStatus ?? []} />
        <StatusBreakdownCard title="Purchase Orders by Status" rows={data?.poByStatus ?? []} />
        <StatusBreakdownCard title="Goods Received Notes by Status" rows={data?.grnByStatus ?? []} />
      </div>
    </div>
  );
}

function VendorSpendReport() {
  const { data, isLoading } = useQuery({ queryKey: ['report-vendor-spend'], queryFn: reportsApi.vendorSpend });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3">Vendor</th>
            <th className="px-4 py-3">GST Number</th>
            <th className="px-4 py-3">Approved PO Count</th>
            <th className="px-4 py-3">Total Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {(data ?? []).length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                No approved Purchase Orders yet
              </td>
            </tr>
          )}
          {(data ?? []).map((row: any) => (
            <tr key={row.vendorId}>
              <td className="px-4 py-3 font-medium">{row.vendor?.name ?? '—'}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.vendor?.gstNumber ?? '—'}</td>
              <td className="px-4 py-3">{row.poCount}</td>
              <td className="px-4 py-3">₹{Number(row.totalValue).toLocaleString('en-IN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
