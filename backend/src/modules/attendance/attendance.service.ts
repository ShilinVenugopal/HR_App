import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const includeRelations = {
  employee: { select: { id: true, name: true, employeeCode: true } },
  project: { select: { id: true, projectName: true } },
  unit: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} satisfies Prisma.AttendanceInclude;

export interface AttendanceFilters {
  projectId?: string;
  employeeId?: string;
  unitId?: string;
  status?: string;
  approvalStatus?: string;
  shift?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listAttendance(req: Request, pagination: PaginationParams, filters: AttendanceFilters) {
  const where: Prisma.AttendanceWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
    ...(filters.unitId ? { unitId: filters.unitId } : {}),
    ...(filters.status ? { status: filters.status as any } : {}),
    ...(filters.approvalStatus ? { approvalStatus: filters.approvalStatus as any } : {}),
    ...(filters.shift ? { shift: filters.shift as any } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          date: {
            ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
            ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      include: includeRelations,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'date']: pagination.sortOrder },
    }),
    prisma.attendance.count({ where }),
  ]);

  return { rows, total };
}

async function loadAndAuthorize(req: Request, id: string) {
  const record = await prisma.attendance.findUnique({ where: { id }, include: includeRelations });
  if (!record) throw ApiError.notFound('Attendance record not found');
  assertProjectAccess(req, record.projectId);
  return record;
}

export async function getAttendance(req: Request, id: string) {
  return loadAndAuthorize(req, id);
}

/// Throws if the unit doesn't belong to this project, or isn't Active —
/// the exact wording matches the design brief's validation-message
/// requirements so the frontend can surface it as-is.
async function assertUnitBelongsToProject(unitId: string, projectId: string) {
  const unit = await prisma.projectUnit.findUnique({ where: { id: unitId } });
  if (!unit || unit.projectId !== projectId) {
    throw ApiError.badRequest('The selected Unit is not valid for this Project.');
  }
  if (unit.status !== 'ACTIVE') {
    throw ApiError.badRequest('The selected Unit is not valid for this Project.');
  }
  return unit;
}

export async function markAttendance(
  req: Request,
  input: {
    employeeId: string;
    date: Date;
    unitId: string;
    shift?: string;
    inTime?: string;
    outTime?: string;
    status?: string;
    overtimeHours?: number;
    remarks?: string;
  },
  meta?: RequestMeta
) {
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) throw ApiError.notFound('Employee not found');
  assertProjectAccess(req, employee.projectId);

  await assertUnitBelongsToProject(input.unitId, employee.projectId);

  const record = await prisma.attendance.create({
    data: {
      employeeId: employee.id,
      projectId: employee.projectId,
      unitId: input.unitId,
      date: input.date,
      shift: input.shift as any,
      inTime: input.inTime,
      outTime: input.outTime,
      status: input.status as any,
      overtimeHours: input.overtimeHours ?? 0,
      remarks: input.remarks,
      createdById: req.user!.sub,
      updatedById: req.user!.sub,
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'ATTENDANCE',
    projectId: record.projectId,
    status: 'SUCCESS',
    meta,
    details: { attendanceId: record.id, employeeId: employee.id, date: input.date, unitId: input.unitId },
  });

  return record;
}

export async function updateAttendance(req: Request, id: string, input: Prisma.AttendanceUncheckedUpdateInput & { unitId?: string }, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.isLocked) throw ApiError.badRequest('This attendance period is locked and cannot be edited');

  if (input.unitId) {
    await assertUnitBelongsToProject(input.unitId, existing.projectId);
  }

  const record = await prisma.attendance.update({
    where: { id },
    data: { ...input, updatedById: req.user!.sub },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'ATTENDANCE',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { attendanceId: id, changes: input },
  });

  return record;
}

export async function deleteAttendance(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.isLocked) throw ApiError.badRequest('This attendance period is locked and cannot be deleted');

  await prisma.attendance.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'ATTENDANCE',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { attendanceId: id },
  });
}

export async function setApproval(req: Request, id: string, approved: boolean, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);

  const record = await prisma.attendance.update({
    where: { id },
    data: {
      approvalStatus: approved ? 'APPROVED' : 'REJECTED',
      approvedById: req.user!.sub,
      approvedAt: new Date(),
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'APPROVE',
    module: 'ATTENDANCE',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { attendanceId: id, approved },
  });

  return record;
}

// ─────────────────────────────────────────────────────────────────────────
// Project-wise Manpower Summary
// ─────────────────────────────────────────────────────────────────────────

/// How each AttendanceStatus counts toward "attendance days" — PRESENT and
/// HALF_DAY are the only statuses that represent actual work; the rest
/// count as zero. This is a new, additive metric (attendance isn't
/// currently read by payroll at all — see wages/projectWages, which are
/// driven by uploaded Excel templates, not this table) so there's no
/// existing calculation to stay consistent with.
const ATTENDANCE_DAY_WEIGHT: Partial<Record<string, number>> = { PRESENT: 1, HALF_DAY: 0.5 };

function dayWeight(status: string): number {
  return ATTENDANCE_DAY_WEIGHT[status] ?? 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function monthRange(month: number, year: number) {
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

const UNASSIGNED = 'UNASSIGNED';

export interface ManpowerSummaryParams {
  projectId: string;
  month: number;
  year: number;
}

/// Manpower is a DISTINCT employee count, never a row/attendance-entry
/// count — an employee present all 25 working days in a Unit still
/// counts once. An employee who worked in two Units during the month
/// counts once per Unit, but only once in the project-wide total (see
/// the design brief's "employee moving between Units" requirement).
///
/// Pulled as a compact 3-column projection (employeeId/unitId/status) for
/// one project+month — indexed and small, not "the entire attendance
/// database" — then reduced to distinct-employee sets server-side rather
/// than shipping raw rows to the browser for the frontend to count.
export async function getManpowerSummary(req: Request, params: ManpowerSummaryParams) {
  assertProjectAccess(req, params.projectId);
  const { start, end } = monthRange(params.month, params.year);

  const rows = await prisma.attendance.findMany({
    where: { projectId: params.projectId, date: { gte: start, lt: end } },
    select: { employeeId: true, unitId: true, status: true },
  });

  const projectEmployees = new Set<string>();
  const buckets = new Map<string, { unitId: string | null; employees: Set<string>; days: number }>();

  for (const row of rows) {
    projectEmployees.add(row.employeeId);
    const key = row.unitId ?? UNASSIGNED;
    if (!buckets.has(key)) buckets.set(key, { unitId: row.unitId, employees: new Set(), days: 0 });
    const bucket = buckets.get(key)!;
    bucket.employees.add(row.employeeId);
    bucket.days += dayWeight(row.status);
  }

  const unitIds = [...buckets.values()].map((b) => b.unitId).filter((id): id is string => Boolean(id));
  const units = unitIds.length ? await prisma.projectUnit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(units.map((u) => [u.id, u.name]));

  const unitsSummary = [...buckets.values()]
    .map((bucket) => ({
      unitId: bucket.unitId,
      // Historical rows saved before this feature existed have no Unit —
      // surfaced as its own row rather than silently dropped, so nothing
      // about the month's real headcount goes missing from the summary.
      unitName: bucket.unitId ? nameById.get(bucket.unitId) ?? 'Unknown Unit' : 'Unassigned (recorded before Unit was required)',
      manpower: bucket.employees.size,
      attendanceDays: round1(bucket.days),
    }))
    .sort((a, b) => a.unitName.localeCompare(b.unitName));

  return {
    projectId: params.projectId,
    month: params.month,
    year: params.year,
    totalUniqueManpower: projectEmployees.size,
    totalUnits: unitsSummary.filter((u) => u.unitId).length,
    totalAttendanceDays: round1(unitsSummary.reduce((sum, u) => sum + u.attendanceDays, 0)),
    units: unitsSummary,
  };
}

export interface ManpowerSummaryEmployeesParams extends ManpowerSummaryParams {
  /// Omit for every employee across every Unit (used by the Excel
  /// export's employee-detail sheet); pass a Unit id to drill into just
  /// that Unit; pass the literal 'UNASSIGNED' for the pre-Unit-era bucket.
  unitId?: string;
}

export async function getManpowerSummaryEmployees(req: Request, params: ManpowerSummaryEmployeesParams) {
  assertProjectAccess(req, params.projectId);
  const { start, end } = monthRange(params.month, params.year);

  const rows = await prisma.attendance.findMany({
    where: {
      projectId: params.projectId,
      date: { gte: start, lt: end },
      ...(params.unitId === UNASSIGNED ? { unitId: null } : params.unitId ? { unitId: params.unitId } : {}),
    },
    select: {
      employeeId: true,
      unitId: true,
      status: true,
      employee: { select: { id: true, name: true, employeeCode: true } },
      unit: { select: { id: true, name: true } },
    },
  });

  const byEmployeeUnit = new Map<
    string,
    { employeeId: string; employeeCode: string; employeeName: string; unitId: string | null; unitName: string; attendanceDays: number }
  >();

  for (const row of rows) {
    const key = `${row.employeeId}::${row.unitId ?? UNASSIGNED}`;
    if (!byEmployeeUnit.has(key)) {
      byEmployeeUnit.set(key, {
        employeeId: row.employeeId,
        employeeCode: row.employee.employeeCode,
        employeeName: row.employee.name,
        unitId: row.unitId,
        unitName: row.unit?.name ?? 'Unassigned (recorded before Unit was required)',
        attendanceDays: 0,
      });
    }
    byEmployeeUnit.get(key)!.attendanceDays += dayWeight(row.status);
  }

  return [...byEmployeeUnit.values()]
    .map((e) => ({ ...e, attendanceDays: round1(e.attendanceDays) }))
    .sort((a, b) => a.unitName.localeCompare(b.unitName) || a.employeeName.localeCompare(b.employeeName));
}

export async function setLock(req: Request, id: string, locked: boolean, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);

  const record = await prisma.attendance.update({ where: { id }, data: { isLocked: locked }, include: includeRelations });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'ATTENDANCE',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { attendanceId: id, locked },
  });

  return record;
}
