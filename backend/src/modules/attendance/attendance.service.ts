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
  approvedBy: { select: { id: true, name: true } },
} satisfies Prisma.AttendanceInclude;

export interface AttendanceFilters {
  projectId?: string;
  employeeId?: string;
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

export async function markAttendance(
  req: Request,
  input: { employeeId: string; date: Date; shift?: string; inTime?: string; outTime?: string; status?: string; overtimeHours?: number; remarks?: string },
  meta?: RequestMeta
) {
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) throw ApiError.notFound('Employee not found');
  assertProjectAccess(req, employee.projectId);

  const record = await prisma.attendance.create({
    data: {
      employeeId: employee.id,
      projectId: employee.projectId,
      date: input.date,
      shift: input.shift as any,
      inTime: input.inTime,
      outTime: input.outTime,
      status: input.status as any,
      overtimeHours: input.overtimeHours ?? 0,
      remarks: input.remarks,
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
    details: { attendanceId: record.id, employeeId: employee.id, date: input.date },
  });

  return record;
}

export async function updateAttendance(req: Request, id: string, input: Prisma.AttendanceUncheckedUpdateInput, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.isLocked) throw ApiError.badRequest('This attendance period is locked and cannot be edited');

  const record = await prisma.attendance.update({ where: { id }, data: input, include: includeRelations });

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
