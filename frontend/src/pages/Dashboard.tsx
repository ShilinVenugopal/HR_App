import { useQuery } from '@tanstack/react-query';
import { Users, UserCheck, UserX, CalendarClock, ClipboardCheck, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { dashboardApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { useAuth } from '../context/AuthContext';

const PIE_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

export default function Dashboard() {
  const { session, isSuperAdmin } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard-summary'], queryFn: dashboardApi.summary });

  const cards = data?.cards;
  const charts = data?.charts;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${session?.user.name?.split(' ')[0]}`}
        description={
          isSuperAdmin
            ? 'Organization-wide view across all projects'
            : `Scoped to your assigned project${session && session.projects.length === 1 ? '' : 's'}: ${session?.projects
                .map((p) => p.projectName)
                .join(', ')}`
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total Employees" value={cards?.totalEmployees ?? 0} icon={Users} loading={isLoading} />
        <StatCard label="Present Today" value={cards?.presentToday ?? 0} icon={UserCheck} loading={isLoading} accent="emerald" />
        <StatCard label="Absent Today" value={cards?.absentToday ?? 0} icon={UserX} loading={isLoading} accent="red" />
        <StatCard label="Pending Interviews" value={cards?.pendingInterviews ?? 0} icon={CalendarClock} loading={isLoading} accent="amber" />
        <StatCard label="Pending Approvals" value={cards?.pendingApprovals ?? 0} icon={ClipboardCheck} loading={isLoading} accent="amber" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Project-wise Employees</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts?.projectWiseEmployees ?? []}>
              <XAxis dataKey="projectName" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Attendance Trend (last 14 days)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={charts?.attendanceTrend ?? []}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="present" stroke="#10b981" strokeWidth={2} dot={false} name="Present" />
              <Line type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={2} dot={false} name="Absent" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Recruitment Funnel</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={charts?.recruitmentFunnel ?? []} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} label>
                {(charts?.recruitmentFunnel ?? []).map((_: unknown, i: number) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Wallet size={16} /> Payroll Status (this month)
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts?.payrollStatus ?? []}>
              <XAxis dataKey="status" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
