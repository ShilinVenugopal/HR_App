import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

export interface CandidateFilters {
  projectId?: string;
  designationId?: string;
  status?: string;
  foraysInterviewStatus?: string;
  clientInterviewStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  experience?: string;
}

export async function listCandidates(req: Request, pagination: PaginationParams, filters: CandidateFilters) {
  const where: Prisma.RecruitmentCandidateWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.designationId ? { designationId: filters.designationId } : {}),
    ...(filters.status ? { status: filters.status as any } : {}),
    ...(filters.foraysInterviewStatus ? { foraysInterviewStatus: filters.foraysInterviewStatus as any } : {}),
    ...(filters.clientInterviewStatus ? { clientInterviewStatus: filters.clientInterviewStatus as any } : {}),
    ...(filters.experience ? { experience: { contains: filters.experience, mode: 'insensitive' } } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          createdAt: {
            ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
            ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
          },
        }
      : {}),
    ...(pagination.search
      ? {
          OR: [
            { candidateName: { contains: pagination.search, mode: 'insensitive' } },
            { contactNumber: { contains: pagination.search, mode: 'insensitive' } },
            { email: { contains: pagination.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.recruitmentCandidate.findMany({
      where,
      include: {
        project: { select: { id: true, projectName: true } },
        designation: { select: { id: true, name: true } },
        employee: { select: { id: true } },
      },
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'createdAt']: pagination.sortOrder },
    }),
    prisma.recruitmentCandidate.count({ where }),
  ]);

  return { rows, total };
}

export async function getCandidate(req: Request, id: string) {
  const candidate = await prisma.recruitmentCandidate.findUnique({
    where: { id },
    include: { project: true, designation: true, employee: { select: { id: true } } },
  });
  if (!candidate) throw ApiError.notFound('Candidate not found');
  assertProjectAccess(req, candidate.projectId);
  return candidate;
}

export async function createCandidate(req: Request, input: Prisma.RecruitmentCandidateUncheckedCreateInput, meta?: RequestMeta) {
  if (input.projectId) assertProjectAccess(req, input.projectId as string);

  const candidate = await prisma.recruitmentCandidate.create({
    data: { ...input, createdById: req.user!.sub },
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'RECRUITMENT',
    projectId: candidate.projectId,
    status: 'SUCCESS',
    meta,
    details: { candidateId: candidate.id, candidateName: candidate.candidateName },
  });

  return candidate;
}

export async function updateCandidate(
  req: Request,
  id: string,
  input: Prisma.RecruitmentCandidateUncheckedUpdateInput,
  meta?: RequestMeta
) {
  const existing = await getCandidate(req, id);
  if (input.projectId) assertProjectAccess(req, input.projectId as string);

  const candidate = await prisma.recruitmentCandidate.update({ where: { id }, data: input });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'RECRUITMENT',
    projectId: candidate.projectId ?? existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { candidateId: id, changes: input },
  });

  return candidate;
}

export async function deleteCandidate(req: Request, id: string, meta?: RequestMeta) {
  const existing = await getCandidate(req, id);
  await prisma.recruitmentCandidate.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'RECRUITMENT',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { candidateId: id },
  });
}
