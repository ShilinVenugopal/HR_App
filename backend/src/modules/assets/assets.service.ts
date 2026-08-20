import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, hasProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';
import { BulkAssetRow } from './assets.validation';

const includeRelations = {
  project: { select: { id: true, projectName: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.AssetInclude;

export interface AssetFilters {
  projectId?: string;
  costCode?: string;
  date?: string;
}

const SORTABLE_FIELDS = new Set([
  'srNo',
  'costCode',
  'itemDescription',
  'unit',
  'workingQuantity',
  'nonWorkingQuantity',
  'date',
  'createdAt',
]);

/// `sortBy=project` sorts by the related project's name, since 'project' is
/// not a column on Asset itself — every other sortable key maps directly.
function buildOrderBy(sortBy: string | undefined, sortOrder: 'asc' | 'desc'): Prisma.AssetOrderByWithRelationInput {
  if (sortBy === 'project') return { project: { projectName: sortOrder } };
  if (sortBy && SORTABLE_FIELDS.has(sortBy)) return { [sortBy]: sortOrder };
  return { srNo: sortOrder };
}

export async function listAssets(req: Request, pagination: PaginationParams, filters: AssetFilters) {
  const dateStart = filters.date ? new Date(`${filters.date}T00:00:00.000Z`) : null;

  const where: Prisma.AssetWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.costCode ? { costCode: { contains: filters.costCode, mode: 'insensitive' } } : {}),
    ...(dateStart
      ? {
          date: {
            gte: dateStart,
            lt: new Date(dateStart.getTime() + 24 * 60 * 60 * 1000),
          },
        }
      : {}),
    ...(pagination.search ? { itemDescription: { contains: pagination.search, mode: 'insensitive' } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      include: includeRelations,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: buildOrderBy(pagination.sortBy, pagination.sortOrder),
    }),
    prisma.asset.count({ where }),
  ]);

  return { rows, total };
}

async function loadAndAuthorize(req: Request, id: string) {
  const record = await prisma.asset.findUnique({ where: { id }, include: includeRelations });
  if (!record) throw ApiError.notFound('Asset not found');
  assertProjectAccess(req, record.projectId);
  return record;
}

export async function getAsset(req: Request, id: string) {
  return loadAndAuthorize(req, id);
}

export async function createAsset(req: Request, input: Prisma.AssetUncheckedCreateInput, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);

  const record = await prisma.asset.create({
    data: { ...input, createdById: req.user!.sub },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'ASSETS',
    projectId: record.projectId,
    status: 'SUCCESS',
    meta,
    details: { assetId: record.id, costCode: record.costCode, itemDescription: record.itemDescription },
  });

  return record;
}

export async function updateAsset(req: Request, id: string, input: Prisma.AssetUncheckedUpdateInput, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (input.projectId) assertProjectAccess(req, input.projectId as string);

  const record = await prisma.asset.update({
    where: { id },
    data: { ...input, updatedById: req.user!.sub },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'ASSETS',
    projectId: record.projectId,
    status: 'SUCCESS',
    meta,
    details: { assetId: id, changes: input },
  });

  return record;
}

export async function deleteAsset(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  await prisma.asset.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'ASSETS',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { assetId: id, itemDescription: existing.itemDescription },
  });
}

// ── Bulk import (Excel) ─────────────────────────────────────────────────

export interface AssetImportFailure {
  rowNumber: number;
  itemDescription: string;
  reason: string;
}

export interface AssetImportResult {
  total: number;
  imported: number;
  failed: number;
  failures: AssetImportFailure[];
}

const CREATE_BATCH_SIZE = 500;

/// Batched Excel import. Every row is re-validated server-side (project
/// existence + access) even though the client already checked — never
/// trust a client-submitted bulk payload. Assets have no natural unique
/// key, so unlike Employees/Recruitment there is no duplicate-skip/update
/// step — every valid row is simply inserted.
export async function bulkImportAssets(req: Request, rows: BulkAssetRow[], meta?: RequestMeta): Promise<AssetImportResult> {
  const result: AssetImportResult = { total: rows.length, imported: 0, failed: 0, failures: [] };

  const projectIds = Array.from(new Set(rows.map((r) => r.projectId)));
  const validProjects = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } });
  const validProjectIds = new Set(validProjects.map((p) => p.id));

  const toCreate: { rowNumber: number; data: Prisma.AssetCreateManyInput }[] = [];

  for (const row of rows) {
    const fail = (reason: string) => {
      result.failed += 1;
      result.failures.push({ rowNumber: row.rowNumber, itemDescription: row.itemDescription, reason });
    };

    if (!validProjectIds.has(row.projectId)) {
      fail('Project not found');
      continue;
    }
    if (!hasProjectAccess(req, row.projectId)) {
      fail('You are not assigned to this project');
      continue;
    }

    toCreate.push({
      rowNumber: row.rowNumber,
      data: {
        costCode: row.costCode,
        itemDescription: row.itemDescription,
        unit: row.unit,
        workingQuantity: row.workingQuantity,
        nonWorkingQuantity: row.nonWorkingQuantity,
        remarks: row.remarks || null,
        date: row.date,
        projectId: row.projectId,
        createdById: req.user!.sub,
      },
    });
  }

  for (let i = 0; i < toCreate.length; i += CREATE_BATCH_SIZE) {
    const chunk = toCreate.slice(i, i + CREATE_BATCH_SIZE);
    try {
      const created = await prisma.asset.createMany({ data: chunk.map((c) => c.data) });
      result.imported += created.count;
    } catch {
      for (const row of chunk) {
        result.failed += 1;
        result.failures.push({
          rowNumber: row.rowNumber,
          itemDescription: row.data.itemDescription,
          reason: 'Database error while inserting this batch',
        });
      }
    }
  }

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'ASSETS',
    status: 'SUCCESS',
    meta,
    details: { bulkImport: true, total: result.total, imported: result.imported, failed: result.failed },
  });

  return result;
}
