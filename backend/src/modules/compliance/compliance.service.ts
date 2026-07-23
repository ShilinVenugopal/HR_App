import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const includeRelations = {
  project: { select: { id: true, projectName: true } },
  employee: { select: { id: true, name: true, employeeCode: true } },
} satisfies Prisma.ComplianceInclude;

export interface ComplianceFilters {
  projectId?: string;
  employeeId?: string;
  type?: string;
  status?: string;
}

export async function listCompliance(req: Request, pagination: PaginationParams, filters: ComplianceFilters) {
  const where: Prisma.ComplianceWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
    ...(filters.type ? { type: filters.type as any } : {}),
    ...(filters.status ? { status: filters.status as any } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.compliance.findMany({
      where,
      include: includeRelations,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'validTo']: pagination.sortOrder },
    }),
    prisma.compliance.count({ where }),
  ]);

  return { rows, total };
}

/// Items expiring within `days` (default 30) across the caller's
/// accessible projects — backs the dashboard's "Expiry Notifications" card.
export async function listExpiringSoon(req: Request, days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  return prisma.compliance.findMany({
    where: {
      ...projectScopeWhere(req),
      validTo: { lte: cutoff, gte: new Date(0) },
      status: { not: 'EXPIRED' },
    },
    include: includeRelations,
    orderBy: { validTo: 'asc' },
  });
}

async function loadAndAuthorize(req: Request, id: string) {
  const record = await prisma.compliance.findUnique({ where: { id }, include: includeRelations });
  if (!record) throw ApiError.notFound('Compliance record not found');
  assertProjectAccess(req, record.projectId);
  return record;
}

export async function getCompliance(req: Request, id: string) {
  return loadAndAuthorize(req, id);
}

export async function createCompliance(req: Request, input: Prisma.ComplianceUncheckedCreateInput, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);

  const record = await prisma.compliance.create({ data: input, include: includeRelations });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'COMPLIANCE',
    projectId: record.projectId,
    status: 'SUCCESS',
    meta,
    details: { complianceId: record.id, type: record.type },
  });

  return record;
}

export async function updateCompliance(req: Request, id: string, input: Prisma.ComplianceUncheckedUpdateInput, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);

  const record = await prisma.compliance.update({ where: { id }, data: input, include: includeRelations });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'COMPLIANCE',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { complianceId: id, changes: input },
  });

  return record;
}

export async function deleteCompliance(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  await prisma.compliance.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'COMPLIANCE',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { complianceId: id },
  });
}
