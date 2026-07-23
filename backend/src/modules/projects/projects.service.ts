import { Prisma, ProjectStatus } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { getAccessibleProjectIds } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';

/// Project listing is itself project-scoped: a Site Admin/HR Executive/etc.
/// only ever sees projects they've been assigned to, even in dropdowns.
export async function listProjects(req: Request, pagination: PaginationParams) {
  const accessible = getAccessibleProjectIds(req);
  const where: Prisma.ProjectWhereInput = {
    ...(accessible === 'ALL' ? {} : { id: { in: accessible } }),
    ...(pagination.search
      ? {
          OR: [
            { projectName: { contains: pagination.search, mode: 'insensitive' } },
            { clientName: { contains: pagination.search, mode: 'insensitive' } },
            { location: { contains: pagination.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'createdAt']: pagination.sortOrder },
    }),
    prisma.project.count({ where }),
  ]);

  return { rows, total };
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw ApiError.notFound('Project not found');
  return project;
}

export async function createProject(
  input: { projectName: string; clientName: string; location?: string; status?: ProjectStatus },
  actingUserId: string,
  meta?: import('../../utils/requestMeta').RequestMeta
) {
  const project = await prisma.project.create({ data: input });
  await recordAuditLog({
    userId: actingUserId,
    action: 'CREATE',
    module: 'SETTINGS',
    projectId: project.id,
    status: 'SUCCESS',
    meta,
    details: { projectName: project.projectName },
  });
  return project;
}

export async function updateProject(
  id: string,
  input: Partial<{ projectName: string; clientName: string; location: string; status: ProjectStatus }>,
  actingUserId: string,
  meta?: import('../../utils/requestMeta').RequestMeta
) {
  await getProject(id);
  const project = await prisma.project.update({ where: { id }, data: input });
  await recordAuditLog({
    userId: actingUserId,
    action: 'UPDATE',
    module: 'SETTINGS',
    projectId: id,
    status: 'SUCCESS',
    meta,
    details: { changes: input },
  });
  return project;
}

export async function deleteProject(id: string, actingUserId: string, meta?: import('../../utils/requestMeta').RequestMeta) {
  await getProject(id);

  const [employeeCount, candidateCount] = await Promise.all([
    prisma.employee.count({ where: { projectId: id } }),
    prisma.recruitmentCandidate.count({ where: { projectId: id } }),
  ]);
  if (employeeCount > 0 || candidateCount > 0) {
    throw ApiError.conflict(
      'This project has linked employees or candidates and cannot be deleted. Set it to Inactive instead.'
    );
  }

  await prisma.project.delete({ where: { id } });
  await recordAuditLog({
    userId: actingUserId,
    action: 'DELETE',
    module: 'SETTINGS',
    projectId: id,
    status: 'SUCCESS',
    meta,
  });
}
