import { useQuery } from '@tanstack/react-query';
import { ClipboardList, FileSpreadsheet, PackageCheck, Boxes } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { procurementDashboardApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { useAuth } from '../context/AuthContext';

const PIE_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

export default function ProcurementDashboard() {
  const { session, isSuperAdmin } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['procurement-dashboard-summary'], queryFn: procurementDashboardApi.summary });

  const cards = data?.cards;
  const charts = data?.charts;

  return (
    <div>
      <PageHeader
        title="Procurement Dashboard"
        description={
          isSuperAdmin
            ? 'Organization-wide procurement view across all projects'
            : `Scoped to your assigned project${session && session.projects.length === 1 ? '' : 's'}: ${session?.projects
                .map((p) => p.projectName)
                .join(', ')}`
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pending PR Approvals" value={cards?.pendingPrApprovals ?? 0} icon={FileSpreadsheet} loading={isLoading} accent="amber" />
        <StatCard label="Pending PO Approvals" value={cards?.pendingPoApprovals ?? 0} icon={ClipboardList} loading={isLoading} accent="amber" />
        <StatCard label="Pending GRN Approvals" value={cards?.pendingGrnApprovals ?? 0} icon={PackageCheck} loading={isLoading} accent="amber" />
        <StatCard label="Inventory Items" value={cards?.totalInventoryItems ?? 0} icon={Boxes} loading={isLoading} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total Working Quantity (all items)</p>
          <p className="text-xl font-semibold">{(cards?.totalWorkingQuantity ?? 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total Non-working Quantity (all items)</p>
          <p className="text-xl font-semibold">{(cards?.totalNonWorkingQuantity ?? 0).toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Purchase Requisition Status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={charts?.prStatus ?? []} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} label>
                {(charts?.prStatus ?? []).map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Purchase Order Status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={charts?.poStatus ?? []} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} label>
                {(charts?.poStatus ?? []).map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Goods Received Note Status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts?.grnStatus ?? []}>
              <XAxis dataKey="status" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Approved PO Spend Trend (last 6 months)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={charts?.spendTrend ?? []}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
              <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
              <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} name="Spend" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold">Top Vendors by Approved PO Value</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts?.topVendors ?? []} layout="vertical" margin={{ left: 40 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
              <YAxis type="category" dataKey="vendorName" tick={{ fontSize: 11 }} width={160} />
              <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
              <Bar dataKey="totalValue" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
