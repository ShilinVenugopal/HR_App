import { Request } from 'express';
import { prisma } from '../../config/database';
import { projectScopeWhere } from '../../middleware/project.middleware';

export async function projectWiseManpowerReport(req: Request) {
  const grouped = await prisma.employee.groupBy({
    by: ['projectId', 'status'],
    where: projectScopeWhere(req),
    _count: { _all: true },
  });

  const projects = await prisma.project.findMany({
    where: projectScopeWhere(req, 'id'),
    select: { id: true, projectName: true, clientName: true },
  });

  return projects.map((project) => {
    const rows = grouped.filter((g) => g.projectId === project.id);
    const total = rows.reduce((sum, r) => sum + r._count._all, 0);
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    return { project, total, byStatus };
  });
}

export async function employeeReport(req: Request) {
  return prisma.employee.findMany({
    where: projectScopeWhere(req),
    include: {
      project: { select: { id: true, projectName: true } },
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function attendanceReport(req: Request, dateFrom?: string, dateTo?: string) {
  const where = {
    ...projectScopeWhere(req),
    ...(dateFrom || dateTo
      ? {
          date: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };

  const [byStatus, byProject] = await Promise.all([
    prisma.attendance.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ['projectId'], where, _count: { _all: true } }),
  ]);

  const projects = await prisma.project.findMany({
    where: { id: { in: byProject.map((p) => p.projectId) } },
    select: { id: true, projectName: true },
  });
  const nameMap = new Map(projects.map((p) => [p.id, p.projectName]));

  return {
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
    byProject: byProject.map((r) => ({ projectId: r.projectId, projectName: nameMap.get(r.projectId), count: r._count._all })),
  };
}

export async function recruitmentReport(req: Request) {
  const byStatus = await prisma.recruitmentCandidate.groupBy({
    by: ['status'],
    where: projectScopeWhere(req),
    _count: { _all: true },
  });
  const byProject = await prisma.recruitmentCandidate.groupBy({
    by: ['projectId'],
    where: projectScopeWhere(req),
    _count: { _all: true },
  });

  return {
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
    byProject,
  };
}

export async function payrollReport(req: Request, month?: number, year?: number) {
  const where = {
    ...projectScopeWhere(req),
    ...(month ? { month } : {}),
    ...(year ? { year } : {}),
  };

  const rows = await prisma.wageRecord.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true, employeeCode: true } },
      project: { select: { id: true, projectName: true } },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.grossWage += Number(r.grossWage);
      acc.netWage += Number(r.netWage);
      acc.deductions += Number(r.pfDeduction) + Number(r.esicDeduction) + Number(r.advanceRecovery) + Number(r.otherDeductions);
      return acc;
    },
    { grossWage: 0, netWage: 0, deductions: 0 }
  );

  return { rows, totals };
}
