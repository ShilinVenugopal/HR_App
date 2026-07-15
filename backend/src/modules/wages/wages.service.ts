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
} satisfies Prisma.WageRecordInclude;

interface WageInput {
  presentDays?: number;
  overtimeHours?: number;
  basicWage?: number;
  allowances?: number;
  overtimeAmount?: number;
  pfDeduction?: number;
  esicDeduction?: number;
  advanceRecovery?: number;
  otherDeductions?: number;
}

/// Gross/net are always computed server-side from the line items — never
/// trust a client-submitted total, since that would let a compromised
/// frontend (or a raw API call) forge payroll figures.
function computeTotals(input: WageInput) {
  const basicWage = input.basicWage ?? 0;
  const allowances = input.allowances ?? 0;
  const overtimeAmount = input.overtimeAmount ?? 0;
  const pfDeduction = input.pfDeduction ?? 0;
  const esicDeduction = input.esicDeduction ?? 0;
  const advanceRecovery = input.advanceRecovery ?? 0;
  const otherDeductions = input.otherDeductions ?? 0;

  const grossWage = basicWage + allowances + overtimeAmount;
  const netWage = grossWage - pfDeduction - esicDeduction - advanceRecovery - otherDeductions;

  return { grossWage, netWage };
}

export interface WageFilters {
  projectId?: string;
  employeeId?: string;
  month?: number;
  year?: number;
  status?: string;
}

export async function listWages(req: Request, pagination: PaginationParams, filters: WageFilters) {
  const where: Prisma.WageRecordWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
    ...(filters.month ? { month: filters.month } : {}),
    ...(filters.year ? { year: filters.year } : {}),
    ...(filters.status ? { status: filters.status as any } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.wageRecord.findMany({
      where,
      include: includeRelations,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    }),
    prisma.wageRecord.count({ where }),
  ]);

  return { rows, total };
}

async function loadAndAuthorize(req: Request, id: string) {
  const record = await prisma.wageRecord.findUnique({ where: { id }, include: includeRelations });
  if (!record) throw ApiError.notFound('Wage record not found');
  assertProjectAccess(req, record.projectId);
  return record;
}

export async function getWage(req: Request, id: string) {
  return loadAndAuthorize(req, id);
}

export async function createWage(req: Request, input: WageInput & { employeeId: string; month: number; year: number }, meta?: RequestMeta) {
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) throw ApiError.notFound('Employee not found');
  assertProjectAccess(req, employee.projectId);

  const { grossWage, netWage } = computeTotals(input);

  const record = await prisma.wageRecord.create({
    data: {
      employeeId: employee.id,
      projectId: employee.projectId,
      month: input.month,
      year: input.year,
      presentDays: input.presentDays ?? 0,
      overtimeHours: input.overtimeHours ?? 0,
      basicWage: input.basicWage ?? 0,
      allowances: input.allowances ?? 0,
      overtimeAmount: input.overtimeAmount ?? 0,
      pfDeduction: input.pfDeduction ?? 0,
      esicDeduction: input.esicDeduction ?? 0,
      advanceRecovery: input.advanceRecovery ?? 0,
      otherDeductions: input.otherDeductions ?? 0,
      grossWage,
      netWage,
      // Generated payroll is immediately actionable — there is no separate
      // "save as draft" step in the UI, so it must not land in DRAFT with
      // no path forward to approval.
      status: 'PENDING_APPROVAL',
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'WAGES',
    projectId: record.projectId,
    status: 'SUCCESS',
    meta,
    details: { wageId: record.id, employeeId: employee.id, month: input.month, year: input.year },
  });

  return record;
}

export async function updateWage(req: Request, id: string, input: WageInput, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status === 'APPROVED' || existing.status === 'PAID') {
    throw ApiError.badRequest('This payroll record is already approved/paid and cannot be edited');
  }

  const merged: WageInput = {
    presentDays: input.presentDays ?? Number(existing.presentDays),
    overtimeHours: input.overtimeHours ?? Number(existing.overtimeHours),
    basicWage: input.basicWage ?? Number(existing.basicWage),
    allowances: input.allowances ?? Number(existing.allowances),
    overtimeAmount: input.overtimeAmount ?? Number(existing.overtimeAmount),
    pfDeduction: input.pfDeduction ?? Number(existing.pfDeduction),
    esicDeduction: input.esicDeduction ?? Number(existing.esicDeduction),
    advanceRecovery: input.advanceRecovery ?? Number(existing.advanceRecovery),
    otherDeductions: input.otherDeductions ?? Number(existing.otherDeductions),
  };
  const { grossWage, netWage } = computeTotals(merged);

  const record = await prisma.wageRecord.update({
    where: { id },
    data: { ...merged, grossWage, netWage, status: 'PENDING_APPROVAL' },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'WAGES',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { wageId: id, changes: input },
  });

  return record;
}

export async function deleteWage(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status === 'APPROVED' || existing.status === 'PAID') {
    throw ApiError.badRequest('This payroll record is already approved/paid and cannot be deleted');
  }

  await prisma.wageRecord.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'WAGES',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { wageId: id },
  });
}

export async function approveWage(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);

  const record = await prisma.wageRecord.update({
    where: { id },
    data: { status: 'APPROVED', approvedById: req.user!.sub, approvedAt: new Date() },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'APPROVE',
    module: 'WAGES',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { wageId: id },
  });

  return record;
}

export async function markWagePaid(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status !== 'APPROVED') throw ApiError.badRequest('Only approved payroll records can be marked as paid');

  const record = await prisma.wageRecord.update({ where: { id }, data: { status: 'PAID' }, include: includeRelations });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'WAGES',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { wageId: id, markedPaid: true },
  });

  return record;
}
