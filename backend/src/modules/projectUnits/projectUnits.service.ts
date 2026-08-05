import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const includeRelations = {
  project: { select: { id: true, projectName: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.ProjectUnitInclude;

/// Units are project-scoped reference data — a caller only ever sees
/// Units belonging to projects they're assigned to (or all, for Super
/// Admin), same isolation rule as every other operational table.
export async function listProjectUnits(req: Request, projectId?: string, statusFilter?: string) {
  if (projectId) assertProjectAccess(req, projectId);

  const where: Prisma.ProjectUnitWhereInput = {
    ...projectScopeWhere(req),
    ...(projectId ? { projectId } : {}),
    ...(statusFilter ? { status: statusFilter as Prisma.ProjectUnitWhereInput['status'] } : {}),
  };

  return prisma.projectUnit.findMany({ where, include: includeRelations, orderBy: { name: 'asc' } });
}

export async function getProjectUnit(req: Request, id: string) {
  const unit = await prisma.projectUnit.findUnique({ where: { id }, include: includeRelations });
  if (!unit) throw ApiError.notFound('Unit not found');
  assertProjectAccess(req, unit.projectId);
  return unit;
}

export interface ProjectUnitInput {
  projectId: string;
  name: string;
  description?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export async function createProjectUnit(req: Request, input: ProjectUnitInput, actingUserId: string, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);

  const existing = await prisma.projectUnit.findUnique({ where: { projectId_name: { projectId: input.projectId, name: input.name } } });
  if (existing) throw ApiError.conflict(`Unit "${input.name}" already exists for this project`);

  const unit = await prisma.projectUnit.create({
    data: {
      projectId: input.projectId,
      name: input.name,
      description: input.description || null,
      status: input.status ?? 'ACTIVE',
      createdById: actingUserId,
      updatedById: actingUserId,
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: actingUserId,
    action: 'CREATE',
    module: 'ATTENDANCE',
    projectId: unit.projectId,
    status: 'SUCCESS',
    meta,
    details: { unitId: unit.id, name: unit.name },
  });

  return unit;
}

export async function updateProjectUnit(req: Request, id: string, input: Partial<Omit<ProjectUnitInput, 'projectId'>>, actingUserId: string, meta?: RequestMeta) {
  const existing = await getProjectUnit(req, id);

  if (input.name && input.name !== existing.name) {
    const dup = await prisma.projectUnit.findUnique({ where: { projectId_name: { projectId: existing.projectId, name: input.name } } });
    if (dup) throw ApiError.conflict(`Unit "${input.name}" already exists for this project`);
  }

  const unit = await prisma.projectUnit.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description !== undefined ? input.description || null : undefined,
      status: input.status,
      updatedById: actingUserId,
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: actingUserId,
    action: 'UPDATE',
    module: 'ATTENDANCE',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { unitId: id, changes: input },
  });

  return unit;
}

export async function deleteProjectUnit(req: Request, id: string, actingUserId: string, meta?: RequestMeta) {
  const existing = await getProjectUnit(req, id);

  const attendanceCount = await prisma.attendance.count({ where: { unitId: id } });
  if (attendanceCount > 0) {
    throw ApiError.conflict('This Unit has linked attendance records and cannot be deleted — set it Inactive instead.');
  }

  await prisma.projectUnit.delete({ where: { id } });

  await recordAuditLog({
    userId: actingUserId,
    action: 'DELETE',
    module: 'ATTENDANCE',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { unitId: id },
  });
}
