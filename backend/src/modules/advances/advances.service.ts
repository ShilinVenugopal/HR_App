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
  recoveries: { orderBy: [{ year: 'desc' as const }, { month: 'desc' as const }] },
} satisfies Prisma.AdvanceInclude;

export interface AdvanceFilters {
  projectId?: string;
  employeeId?: string;
  type?: string;
  status?: string;
}

export async function listAdvances(req: Request, pagination: PaginationParams, filters: AdvanceFilters) {
  const where: Prisma.AdvanceWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
    ...(filters.type ? { type: filters.type as any } : {}),
    ...(filters.status ? { status: filters.status as any } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.advance.findMany({
      where,
      include: includeRelations,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'createdAt']: pagination.sortOrder },
    }),
    prisma.advance.count({ where }),
  ]);

  return { rows, total };
}

async function loadAndAuthorize(req: Request, id: string) {
  const record = await prisma.advance.findUnique({ where: { id }, include: includeRelations });
  if (!record) throw ApiError.notFound('Advance/Loan record not found');
  assertProjectAccess(req, record.projectId);
  return record;
}

export async function getAdvance(req: Request, id: string) {
  return loadAndAuthorize(req, id);
}

export async function createAdvance(
  req: Request,
  input: { employeeId: string; type: string; amount: number; reason?: string; installments: number },
  meta?: RequestMeta
) {
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) throw ApiError.notFound('Employee not found');
  assertProjectAccess(req, employee.projectId);

  const record = await prisma.advance.create({
    data: {
      employeeId: employee.id,
      projectId: employee.projectId,
      type: input.type as any,
      amount: input.amount,
      reason: input.reason,
      installments: input.installments,
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'ADVANCES',
    projectId: record.projectId,
    status: 'SUCCESS',
    meta,
    details: { advanceId: record.id, employeeId: employee.id, amount: input.amount },
  });

  return record;
}

export async function updateAdvance(
  req: Request,
  id: string,
  input: { reason?: string; installments?: number; amount?: number },
  meta?: RequestMeta
) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status !== 'PENDING') throw ApiError.badRequest('Only pending requests can be edited');

  const record = await prisma.advance.update({ where: { id }, data: input, include: includeRelations });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'ADVANCES',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { advanceId: id, changes: input },
  });

  return record;
}

export async function setAdvanceApproval(req: Request, id: string, approved: boolean, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status !== 'PENDING') throw ApiError.badRequest('This request has already been actioned');

  const record = await prisma.advance.update({
    where: { id },
    data: {
      status: approved ? 'APPROVED' : 'REJECTED',
      approvedById: req.user!.sub,
      approvedAt: new Date(),
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'APPROVE',
    module: 'ADVANCES',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { advanceId: id, approved },
  });

  return record;
}

export async function deleteAdvance(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status === 'APPROVED') throw ApiError.badRequest('Approved advances cannot be deleted; close it instead');

  await prisma.advance.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'ADVANCES',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { advanceId: id },
  });
}

export async function addRecovery(req: Request, advanceId: string, input: { month: number; year: number; amount: number }, meta?: RequestMeta) {
  const advance = await loadAndAuthorize(req, advanceId);
  if (advance.status !== 'APPROVED') throw ApiError.badRequest('Recoveries can only be recorded against approved advances');

  const remaining = Number(advance.amount) - Number(advance.recoveredAmount);
  if (input.amount > remaining) {
    throw ApiError.badRequest(`Recovery amount exceeds outstanding balance of ${remaining}`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const recovery = await tx.advanceRecovery.create({
      data: { advanceId, month: input.month, year: input.year, amount: input.amount },
    });

    const newRecovered = Number(advance.recoveredAmount) + input.amount;
    const isFullyRecovered = newRecovered >= Number(advance.amount);

    await tx.advance.update({
      where: { id: advanceId },
      data: {
        recoveredAmount: newRecovered,
        status: isFullyRecovered ? 'CLOSED' : advance.status,
      },
    });

    return recovery;
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'ADVANCES',
    projectId: advance.projectId,
    status: 'SUCCESS',
    meta,
    details: { advanceId, recoveryAmount: input.amount, month: input.month, year: input.year },
  });

  return result;
}
