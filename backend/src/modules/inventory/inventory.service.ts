import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, hasProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';
import { BulkInventoryRow } from './inventory.validation';

const includeRelations = {
  project: { select: { id: true, projectName: true } },
  costCode: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.InventoryItemInclude;

export interface InventoryFilters {
  projectId?: string;
  costCodeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listInventory(req: Request, pagination: PaginationParams, filters: InventoryFilters) {
  const where: Prisma.InventoryItemWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.costCodeId ? { costCodeId: filters.costCodeId } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          date: {
            ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
            ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
          },
        }
      : {}),
    ...(pagination.search ? { itemDescription: { contains: pagination.search, mode: 'insensitive' } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      include: includeRelations,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'createdAt']: pagination.sortOrder },
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  return { rows, total };
}

async function loadAndAuthorize(req: Request, id: string) {
  const record = await prisma.inventoryItem.findUnique({ where: { id }, include: includeRelations });
  if (!record) throw ApiError.notFound('Inventory item not found');
  assertProjectAccess(req, record.projectId);
  return record;
}

export async function getInventoryItem(req: Request, id: string) {
  return loadAndAuthorize(req, id);
}

async function assertCostCodeExists(costCodeId: string) {
  const costCode = await prisma.costCode.findUnique({ where: { id: costCodeId } });
  if (!costCode) throw ApiError.badRequest('Cost Code not found');
  return costCode;
}

export interface CreateInventoryInput {
  projectId: string;
  costCodeId: string;
  itemDescription: string;
  unit: string;
  workingQuantity?: number;
  nonWorkingQuantity?: number;
  remarks?: string;
  date?: Date;
}

export async function createInventoryItem(req: Request, input: CreateInventoryInput, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);
  await assertCostCodeExists(input.costCodeId);

  const existing = await prisma.inventoryItem.findUnique({
    where: {
      projectId_costCodeId_itemDescription: {
        projectId: input.projectId,
        costCodeId: input.costCodeId,
        itemDescription: input.itemDescription,
      },
    },
  });
  if (existing) throw ApiError.conflict('An inventory item with this Cost Code and Item Description already exists for this project');

  const record = await prisma.inventoryItem.create({
    data: {
      projectId: input.projectId,
      costCodeId: input.costCodeId,
      itemDescription: input.itemDescription,
      unit: input.unit as any,
      workingQuantity: input.workingQuantity ?? 0,
      nonWorkingQuantity: input.nonWorkingQuantity ?? 0,
      remarks: input.remarks,
      date: input.date ?? new Date(),
      createdById: req.user!.sub,
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'INVENTORY',
    projectId: record.projectId,
    status: 'SUCCESS',
    meta,
    details: { inventoryItemId: record.id, itemDescription: record.itemDescription },
  });

  return record;
}

export async function updateInventoryItem(req: Request, id: string, input: Prisma.InventoryItemUncheckedUpdateInput, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);

  if (input.projectId && typeof input.projectId === 'string') assertProjectAccess(req, input.projectId);
  if (input.costCodeId && typeof input.costCodeId === 'string') await assertCostCodeExists(input.costCodeId);

  const record = await prisma.inventoryItem.update({ where: { id }, data: input, include: includeRelations });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'INVENTORY',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { inventoryItemId: id, changes: input },
  });

  return record;
}

export async function deleteInventoryItem(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);

  await prisma.inventoryItem.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'INVENTORY',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { inventoryItemId: id },
  });
}

export interface DuplicateCheckItem {
  projectId: string;
  costCodeId: string;
  itemDescription: string;
}

export async function checkDuplicateInventoryItems(items: DuplicateCheckItem[]) {
  if (!items.length) return [];
  return prisma.inventoryItem.findMany({
    where: { OR: items.map((i) => ({ projectId: i.projectId, costCodeId: i.costCodeId, itemDescription: i.itemDescription })) },
    include: includeRelations,
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
  updated: number;
  skipped: number;
  failed: number;
  failures: BulkImportFailure[];
}

const CREATE_BATCH_SIZE = 500;

/// Mirrors the Employees bulk-import pattern (employees.service.ts): every
/// row is re-validated server-side even though the client already checked,
/// new rows are inserted with chunked createMany, and rows matching an
/// existing (projectId, costCodeId, itemDescription) are skipped or
/// updated per `duplicateStrategy`.
export async function bulkImportInventory(
  req: Request,
  rows: BulkInventoryRow[],
  duplicateStrategy: 'skip' | 'update',
  meta?: RequestMeta
): Promise<BulkImportResult> {
  const result: BulkImportResult = { total: rows.length, imported: 0, updated: 0, skipped: 0, failed: 0, failures: [] };

  const projectIds = Array.from(new Set(rows.map((r) => r.projectId)));
  const costCodeIds = Array.from(new Set(rows.map((r) => r.costCodeId)));

  const [validProjects, validCostCodes, existing] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } }),
    prisma.costCode.findMany({ where: { id: { in: costCodeIds } }, select: { id: true } }),
    prisma.inventoryItem.findMany({
      where: { OR: rows.map((r) => ({ projectId: r.projectId, costCodeId: r.costCodeId, itemDescription: r.itemDescription })) },
      select: { id: true, projectId: true, costCodeId: true, itemDescription: true },
    }),
  ]);

  const validProjectIds = new Set(validProjects.map((p) => p.id));
  const validCostCodeIds = new Set(validCostCodes.map((c) => c.id));
  const existingMap = new Map(existing.map((e) => [`${e.projectId}::${e.costCodeId}::${e.itemDescription}`, e.id]));

  const toCreate: { rowNumber: number; data: Prisma.InventoryItemCreateManyInput }[] = [];
  const toUpdate: { rowNumber: number; id: string; data: Prisma.InventoryItemUpdateInput }[] = [];
  const seenInFile = new Set<string>();

  for (const row of rows) {
    const fail = (reason: string) => {
      result.failed += 1;
      result.failures.push({ rowNumber: row.rowNumber, itemDescription: row.itemDescription, reason });
    };

    const key = `${row.projectId}::${row.costCodeId}::${row.itemDescription}`;
    if (seenInFile.has(key)) {
      fail('Duplicate row within this file');
      continue;
    }
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

    seenInFile.add(key);

    const commonData = {
      projectId: row.projectId,
      costCodeId: row.costCodeId,
      itemDescription: row.itemDescription,
      unit: row.unit,
      workingQuantity: row.workingQuantity ?? 0,
      nonWorkingQuantity: row.nonWorkingQuantity ?? 0,
      remarks: row.remarks || null,
      date: row.date ?? new Date(),
    };

    const existingId = existingMap.get(key);
    if (existingId) {
      if (duplicateStrategy === 'skip') {
        result.skipped += 1;
        continue;
      }
      toUpdate.push({ rowNumber: row.rowNumber, id: existingId, data: commonData });
      continue;
    }

    toCreate.push({ rowNumber: row.rowNumber, data: { ...commonData, createdById: req.user!.sub } });
  }

  for (let i = 0; i < toCreate.length; i += CREATE_BATCH_SIZE) {
    const chunk = toCreate.slice(i, i + CREATE_BATCH_SIZE);
    try {
      const created = await prisma.inventoryItem.createMany({ data: chunk.map((c) => c.data) });
      result.imported += created.count;
    } catch {
      for (const row of chunk) {
        result.failed += 1;
        result.failures.push({ rowNumber: row.rowNumber, itemDescription: row.data.itemDescription, reason: 'Database error while inserting this batch' });
      }
    }
  }

  if (toUpdate.length) {
    try {
      await prisma.$transaction(toUpdate.map((u) => prisma.inventoryItem.update({ where: { id: u.id }, data: u.data })));
      result.updated += toUpdate.length;
    } catch {
      for (const u of toUpdate) {
        result.failed += 1;
        result.failures.push({ rowNumber: u.rowNumber, itemDescription: (u.data.itemDescription as string) ?? '', reason: 'Database error while updating this record' });
      }
    }
  }

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'INVENTORY',
    status: 'SUCCESS',
    meta,
    details: { bulkImport: true, total: result.total, imported: result.imported, updated: result.updated, skipped: result.skipped, failed: result.failed },
  });

  return result;
}
