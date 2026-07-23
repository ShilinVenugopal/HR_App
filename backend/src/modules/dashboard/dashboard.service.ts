import { Request } from 'express';
import { prisma } from '../../config/database';
import { projectScopeWhere } from '../../middleware/project.middleware';

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/// Every query below folds in projectScopeWhere(req), so the dashboard —
/// like every other module — only ever aggregates data from projects the
/// caller is assigned to (or all projects, for Super Admin).
export async function getDashboardSummary(req: Request) {
  const projectWhere = projectScopeWhere(req);
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [
    totalEmployees,
    presentToday,
    absentToday,
    pendingInterviews,
    pendingAttendanceApprovals,
    pendingAdvanceApprovals,
    pendingWageApprovals,
    projectWiseEmployees,
    recruitmentFunnel,
    payrollStatusCounts,
    attendanceTrendRaw,
  ] = await Promise.all([
    prisma.employee.count({ where: { ...projectWhere, status: 'ACTIVE' } }),
    prisma.attendance.count({ where: { ...projectWhere, date: { gte: todayStart, lte: todayEnd }, status: 'PRESENT' } }),
    prisma.attendance.count({ where: { ...projectWhere, date: { gte: todayStart, lte: todayEnd }, status: 'ABSENT' } }),
    prisma.recruitmentCandidate.count({
      where: { ...projectScopeWhere(req), status: { in: ['APPLIED', 'SCREENING', 'INTERVIEW_SCHEDULED'] } },
    }),
    prisma.attendance.count({ where: { ...projectWhere, approvalStatus: 'PENDING' } }),
    prisma.advance.count({ where: { ...projectWhere, status: 'PENDING' } }),
    prisma.wageRecord.count({ where: { ...projectWhere, status: 'PENDING_APPROVAL' } }),
    prisma.employee.groupBy({
      by: ['projectId'],
      where: { ...projectWhere, status: 'ACTIVE' },
      _count: { _all: true },
    }),
    prisma.recruitmentCandidate.groupBy({
      by: ['status'],
      where: projectScopeWhere(req),
      _count: { _all: true },
    }),
    prisma.wageRecord.groupBy({
      by: ['status'],
      where: { ...projectWhere, month: currentMonth, year: currentYear },
      _count: { _all: true },
    }),
    prisma.attendance.findMany({
      where: { ...projectWhere, date: { gte: new Date(Date.now() - 13 * 86400000) } },
      select: { date: true, status: true },
    }),
  ]);

  const projectIds = projectWiseEmployees.map((p) => p.projectId);
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, projectName: true },
  });
  const projectNameMap = new Map(projects.map((p) => [p.id, p.projectName]));

  const attendanceTrendMap = new Map<string, { present: number; absent: number }>();
  for (const row of attendanceTrendRaw) {
    const key = row.date.toISOString().slice(0, 10);
    const entry = attendanceTrendMap.get(key) ?? { present: 0, absent: 0 };
    if (row.status === 'PRESENT') entry.present += 1;
    if (row.status === 'ABSENT') entry.absent += 1;
    attendanceTrendMap.set(key, entry);
  }

  return {
    cards: {
      totalEmployees,
      presentToday,
      absentToday,
      pendingInterviews,
      pendingApprovals: pendingAttendanceApprovals + pendingAdvanceApprovals + pendingWageApprovals,
      pendingApprovalsBreakdown: {
        attendance: pendingAttendanceApprovals,
        advances: pendingAdvanceApprovals,
        wages: pendingWageApprovals,
      },
    },
    charts: {
      projectWiseEmployees: projectWiseEmployees.map((p) => ({
        projectId: p.projectId,
        projectName: projectNameMap.get(p.projectId) ?? 'Unknown',
        count: p._count._all,
      })),
      recruitmentFunnel: recruitmentFunnel.map((r) => ({ status: r.status, count: r._count._all })),
      payrollStatus: payrollStatusCounts.map((p) => ({ status: p.status, count: p._count._all })),
      attendanceTrend: Array.from(attendanceTrendMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v })),
    },
  };
}
