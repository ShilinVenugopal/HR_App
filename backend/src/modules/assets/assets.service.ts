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
  costCode: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.AssetInclude;

export interface AssetFilters {
  projectId?: string;
  costCodeId?: string;
  date?: string;
}

/// "Sr No" on the Assets page is the record's position in the current
/// sort/page, not a stored column — sorting by it is the same as sorting
/// by creation order. Cost Code / Project are relations, so they need a
/// nested orderBy rather than a flat field. Whitelisting here (rather than
/// trusting the raw sortBy string, as the older Inventory module does)
/// also means an unrecognized key can never reach Prisma as a runtime error.
function resolveOrderBy(sortBy: string | undefined, sortOrder: 'asc' | 'desc'): Prisma.AssetOrderByWithRelationInput {
  switch (sortBy) {
    case 'srNo':
    case 'createdAt':
      return { createdAt: sortOrder };
    case 'costCode':
      return { costCode: { code: sortOrder } };
    case 'project':
      return { project: { projectName: sortOrder } };
    case 'itemDescription':
    case 'unit':
    case 'workingQuantity':
    case 'nonWorkingQuantity':
    case 'date':
      return { [sortBy]: sortOrder };
    default:
      return { createdAt: 'desc' };
  }
}

function dayRange(dateStr: string): { gte: Date; lt: Date } {
  const start = new Date(dateStr);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start, lt: end };
}

export async function listAssets(req: Request, pagination: PaginationParams, filters: AssetFilters) {
  const where: Prisma.AssetWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.costCodeId ? { costCodeId: filters.costCodeId } : {}),
    ...(filters.date ? { date: dayRange(filters.date) } : {}),
    ...(pagination.search ? { itemDescription: { contains: pagination.search, mode: 'insensitive' } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      include: includeRelations,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: resolveOrderBy(pagination.sortBy, pagination.sortOrder),
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

async function assertCostCodeExists(costCodeId: string) {
  const costCode = await prisma.costCode.findUnique({ where: { id: costCodeId } });
  if (!costCode) throw ApiError.badRequest('Cost Code not found');
  return costCode;
}

export interface CreateAssetInput {
  projectId: string;
  costCodeId: string;
  itemDescription: string;
  unit: string;
  workingQuantity: number;
  nonWorkingQuantity: number;
  remarks?: string;
  date: Date;
}

export async function createAsset(req: Request, input: CreateAssetInput, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);
  await assertCostCodeExists(input.costCodeId);

  const record = await prisma.asset.create({
    data: {
      projectId: input.projectId,
      costCodeId: input.costCodeId,
      itemDescription: input.itemDescription,
      unit: input.unit as any,
      workingQuantity: input.workingQuantity,
      nonWorkingQuantity: input.nonWorkingQuantity,
      remarks: input.remarks,
      date: input.date,
      createdById: req.user!.sub,
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'ASSETS',
    projectId: record.projectId,
    status: 'SUCCESS',
    meta,
    details: { assetId: record.id, itemDescription: record.itemDescription },
  });

  return record;
}

export async function updateAsset(req: Request, id: string, input: Prisma.AssetUncheckedUpdateInput, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);

  if (input.projectId && typeof input.projectId === 'string') assertProjectAccess(req, input.projectId);
  if (input.costCodeId && typeof input.costCodeId === 'string') await assertCostCodeExists(input.costCodeId);

  const record = await prisma.asset.update({
    where: { id },
    data: { ...input, updatedById: req.user!.sub },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'ASSETS',
    projectId: existing.projectId,
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

export interface BulkImportFailure {
  rowNumber: number;
  itemDescription: string;
  reason: string;
}

export interface BulkImportResult {
  total: number;
  imported: number;
  failed: number;
  failures: BulkImportFailure[];
}

const CREATE_BATCH_SIZE = 500;

/// Mirrors the Inventory bulk-import pattern (inventory.service.ts): every
/// row is re-validated server-side even though the client already checked.
/// Unlike Inventory, Assets has no natural "same item already exists"
/// upsert key — every valid row becomes its own new Asset record, and
/// invalid rows are skipped and reported (a clearly-defined partial-import
/// pattern already established by Inventory's bulk import).
export async function bulkImportAssets(req: Request, rows: BulkAssetRow[], meta?: RequestMeta): Promise<BulkImportResult> {
  const result: BulkImportResult = { total: rows.length, imported: 0, failed: 0, failures: [] };

  const projectIds = Array.from(new Set(rows.map((r) => r.projectId)));
  const costCodeIds = Array.from(new Set(rows.map((r) => r.costCodeId)));

  const [validProjects, validCostCodes] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } }),
    prisma.costCode.findMany({ where: { id: { in: costCodeIds } }, select: { id: true } }),
  ]);

  const validProjectIds = new Set(validProjects.map((p) => p.id));
  const validCostCodeIds = new Set(validCostCodes.map((c) => c.id));

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
    if (!validCostCodeIds.has(row.costCodeId)) {
      fail('Cost Code not found');
      continue;
    }

    toCreate.push({
      rowNumber: row.rowNumber,
      data: {
        projectId: row.projectId,
        costCodeId: row.costCodeId,
        itemDescription: row.itemDescription,
        unit: row.unit,
        workingQuantity: row.workingQuantity,
        nonWorkingQuantity: row.nonWorkingQuantity,
        remarks: row.remarks || null,
        date: row.date,
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
        result.failures.push({ rowNumber: row.rowNumber, itemDescription: row.data.itemDescription, reason: 'Database error while inserting this batch' });
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
