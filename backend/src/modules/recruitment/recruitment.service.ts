import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, hasProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';
import { BulkCandidateRow } from './recruitment.validation';

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

// ── Bulk import (Excel) ─────────────────────────────────────────────────

export interface DuplicateMatch {
  id: string;
  contactNumber: string;
  candidateName: string;
}

/// Duplicate check is scoped to the caller's accessible projects — a
/// contact number belonging to a candidate in a project the caller can't
/// see must never be revealed to them, even as a "this already exists".
export async function checkDuplicateContacts(req: Request, contactNumbers: string[]): Promise<DuplicateMatch[]> {
  const unique = Array.from(new Set(contactNumbers.map((c) => c.trim()).filter(Boolean)));
  if (!unique.length) return [];

  return prisma.recruitmentCandidate.findMany({
    where: { ...projectScopeWhere(req), contactNumber: { in: unique } },
    select: { id: true, contactNumber: true, candidateName: true },
  });
}

export interface BulkImportFailure {
  rowNumber: number;
  candidateName: string;
  contactNumber: string;
  reason: string;
}

export interface BulkImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  failures: BulkImportFailure[];
}

const CREATE_BATCH_SIZE = 500;

/// Batched Excel import. Every row is re-validated server-side (project
/// existence + access, designation existence) even though the client
/// already checked — never trust a client-submitted bulk payload. New
/// candidates are inserted with a single chunked `createMany` per batch
/// (never one row at a time); rows matching an existing contact number
/// within the caller's accessible projects are either skipped or updated
/// per `duplicateStrategy`, batched into one transaction.
export async function bulkImportCandidates(
  req: Request,
  rows: BulkCandidateRow[],
  duplicateStrategy: 'skip' | 'update',
  meta?: RequestMeta
): Promise<BulkImportResult> {
  const result: BulkImportResult = { total: rows.length, imported: 0, updated: 0, skipped: 0, failed: 0, failures: [] };

  const projectIds = Array.from(new Set(rows.map((r) => r.projectId).filter((v): v is string => Boolean(v))));
  const designationIds = Array.from(new Set(rows.map((r) => r.designationId).filter((v): v is string => Boolean(v))));

  const [validProjects, validDesignations, existingByContact] = await Promise.all([
    projectIds.length ? prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } }) : Promise.resolve([]),
    designationIds.length
      ? prisma.designation.findMany({ where: { id: { in: designationIds } }, select: { id: true } })
      : Promise.resolve([]),
    checkDuplicateContacts(
      req,
      rows.map((r) => r.contactNumber)
    ),
  ]);

  const validProjectIds = new Set(validProjects.map((p) => p.id));
  const validDesignationIds = new Set(validDesignations.map((d) => d.id));
  const existingByContactMap = new Map(existingByContact.map((c) => [c.contactNumber, c.id]));

  const toCreate: { rowNumber: number; data: Prisma.RecruitmentCandidateCreateManyInput }[] = [];
  const toUpdate: { rowNumber: number; id: string; data: Prisma.RecruitmentCandidateUpdateInput }[] = [];

  for (const row of rows) {
    const fail = (reason: string) => {
      result.failed += 1;
      result.failures.push({ rowNumber: row.rowNumber, candidateName: row.candidateName, contactNumber: row.contactNumber, reason });
    };

    if (row.projectId && !validProjectIds.has(row.projectId)) {
      fail('Assigned project no longer exists');
      continue;
    }
    if (row.projectId && !hasProjectAccess(req, row.projectId)) {
      fail('You are not assigned to this project');
      continue;
    }
    if (row.designationId && !validDesignationIds.has(row.designationId)) {
      fail('Designation no longer exists');
      continue;
    }

    const commonData = {
      candidateName: row.candidateName,
      dateOfBirth: row.dateOfBirth ?? null,
      qualification: row.qualification || null,
      experience: row.experience || null,
      designationId: row.designationId || null,
      email: row.email || null,
      projectId: row.projectId || null,
      resumeUrl: row.resumeUrl || null,
      foraysInterviewStatus: row.foraysInterviewStatus,
      clientInterviewStatus: row.clientInterviewStatus,
      remarks: row.remarks || null,
      status: row.status,
      costCode: row.costCode ?? null,
    };

    const existingId = existingByContactMap.get(row.contactNumber);
    if (existingId) {
      if (duplicateStrategy === 'skip') {
        result.skipped += 1;
        continue;
      }
      toUpdate.push({ rowNumber: row.rowNumber, id: existingId, data: commonData });
      continue;
    }

    toCreate.push({
      rowNumber: row.rowNumber,
      data: { ...commonData, contactNumber: row.contactNumber, createdById: req.user!.sub },
    });
  }

  for (let i = 0; i < toCreate.length; i += CREATE_BATCH_SIZE) {
    const chunk = toCreate.slice(i, i + CREATE_BATCH_SIZE);
    try {
      const created = await prisma.recruitmentCandidate.createMany({ data: chunk.map((c) => c.data) });
      result.imported += created.count;
    } catch {
      for (const row of chunk) {
        result.failed += 1;
        result.failures.push({
          rowNumber: row.rowNumber,
          candidateName: row.data.candidateName,
          contactNumber: row.data.contactNumber,
          reason: 'Database error while inserting this batch',
        });
      }
    }
  }

  if (toUpdate.length) {
    try {
      await prisma.$transaction(toUpdate.map((u) => prisma.recruitmentCandidate.update({ where: { id: u.id }, data: u.data })));
      result.updated += toUpdate.length;
    } catch {
      for (const u of toUpdate) {
        result.failed += 1;
        result.failures.push({
          rowNumber: u.rowNumber,
          candidateName: (u.data.candidateName as string) ?? '',
          contactNumber: '',
          reason: 'Database error while updating this record',
        });
      }
    }
  }

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'RECRUITMENT',
    status: 'SUCCESS',
    meta,
    details: {
      bulkImport: true,
      total: result.total,
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    },
  });

  return result;
}
