import { Prisma, ProjectStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const include = {
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.CostCodeInclude;

export interface CostCodeFilters {
  status?: ProjectStatus;
}

export async function listCostCodes(pagination: PaginationParams, filters: CostCodeFilters) {
  const where: Prisma.CostCodeWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(pagination.search
      ? { OR: [{ code: { contains: pagination.search, mode: 'insensitive' } }, { name: { contains: pagination.search, mode: 'insensitive' } }] }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.costCode.findMany({
      where,
      include,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'code']: pagination.sortOrder },
    }),
    prisma.costCode.count({ where }),
  ]);

  return { rows, total };
}

export interface CostCodeInput {
  code: string;
  name: string;
  itemsToConsider?: string;
  remarks?: string;
  responsiblePerson?: string;
  status?: ProjectStatus;
}

export async function createCostCode(input: CostCodeInput, actingUserId: string, meta?: RequestMeta) {
  const existing = await prisma.costCode.findUnique({ where: { code: input.code } });
  if (existing) throw ApiError.conflict(`Cost Code "${input.code}" already exists`);

  const row = await prisma.costCode.create({
    data: {
      code: input.code,
      name: input.name,
      itemsToConsider: input.itemsToConsider || null,
      remarks: input.remarks || null,
      responsiblePerson: input.responsiblePerson || null,
      status: input.status ?? 'ACTIVE',
      createdById: actingUserId,
    },
    include,
  });

  await recordAuditLog({
    userId: actingUserId,
    action: 'CREATE',
    module: 'SETTINGS',
    status: 'SUCCESS',
    meta,
    details: { costCodeId: row.id, code: row.code },
  });

  return row;
}

export type UpdateCostCodeInput = Partial<CostCodeInput>;

export async function updateCostCode(id: string, input: UpdateCostCodeInput, actingUserId: string, meta?: RequestMeta) {
  const existing = await prisma.costCode.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Cost Code not found');

  if (input.code && input.code !== existing.code) {
    const dup = await prisma.costCode.findUnique({ where: { code: input.code } });
    if (dup) throw ApiError.conflict(`Cost Code "${input.code}" already exists`);
  }

  const row = await prisma.costCode.update({
    where: { id },
    data: {
      code: input.code,
      name: input.name,
      itemsToConsider: input.itemsToConsider !== undefined ? input.itemsToConsider || null : undefined,
      remarks: input.remarks !== undefined ? input.remarks || null : undefined,
      responsiblePerson: input.responsiblePerson !== undefined ? input.responsiblePerson || null : undefined,
      status: input.status,
      updatedById: actingUserId,
    },
    include,
  });

  await recordAuditLog({
    userId: actingUserId,
    action: 'UPDATE',
    module: 'SETTINGS',
    status: 'SUCCESS',
    meta,
    details: {
      costCodeId: id,
      changes: input,
      oldStatus: existing.status,
      newStatus: row.status,
    },
  });

  return row;
}

/// Deleting a Cost Code that's already referenced by any historical
/// Inventory/PR/PO/GRN line item would either violate the FK constraint or
/// silently orphan that history — neither acceptable, so this is blocked
/// outright with a message pointing at the safe alternative
/// (Deactivate), matching the existing Vendor-delete precedent.
export async function deleteCostCode(id: string, actingUserId: string, meta?: RequestMeta) {
  const existing = await prisma.costCode.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Cost Code not found');

  const [inventoryCount, prCount, poCount, grnCount] = await Promise.all([
    prisma.inventoryItem.count({ where: { costCodeId: id } }),
    prisma.purchaseRequisitionItem.count({ where: { costCodeId: id } }),
    prisma.purchaseOrderItem.count({ where: { costCodeId: id } }),
    prisma.goodsReceivedNoteItem.count({ where: { costCodeId: id } }),
  ]);
  if (inventoryCount + prCount + poCount + grnCount > 0) {
    throw ApiError.conflict('This Cost Code is used by existing records and cannot be deleted — set it Inactive instead.');
  }

  await prisma.costCode.delete({ where: { id } });

  await recordAuditLog({
    userId: actingUserId,
    action: 'DELETE',
    module: 'SETTINGS',
    status: 'SUCCESS',
    meta,
    details: { costCodeId: id, code: existing.code },
  });
}
