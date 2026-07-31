import { Prisma, BillingItemStatus } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const recordInclude = {
  project: { select: { id: true, projectName: true, projectNumber: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.BillingRecordInclude;

const itemInclude = {
  billingRecord: { include: recordInclude },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.BillingItemInclude;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface BillingItemInput {
  plantUnit: string;
  invoiceNo?: string;
  jmsNo?: string;
  abstractAmount: number;
  taxAmount?: number;
  status?: BillingItemStatus;
}

export interface CreateBillingRecordInput {
  projectId: string;
  billingMonth: number;
  billingYear: number;
  periodFrom?: Date;
  periodTo?: Date;
  items: BillingItemInput[];
}

function computeItemData(item: BillingItemInput, srNo: number, userId: string) {
  const taxAmount = item.taxAmount ?? 0;
  const totalAmount = round2(item.abstractAmount + taxAmount);
  return {
    srNo,
    plantUnit: item.plantUnit,
    invoiceNo: item.invoiceNo || null,
    jmsNo: item.jmsNo || null,
    abstractAmount: item.abstractAmount,
    taxAmount,
    totalAmount,
    status: item.status ?? 'PENDING_CERTIFICATION',
    createdById: userId,
  };
}

/// Creates one BillingRecord header plus all of its BillingItem rows in a
/// single transaction — if any row fails, nothing is partially saved.
export async function createBillingRecord(req: Request, input: CreateBillingRecordInput, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.billingRecord.create({
      data: {
        projectId: input.projectId,
        billingMonth: input.billingMonth,
        billingYear: input.billingYear,
        periodFrom: input.periodFrom ?? null,
        periodTo: input.periodTo ?? null,
        createdById: req.user!.sub,
        items: {
          create: input.items.map((it, idx) => computeItemData(it, idx + 1, req.user!.sub)),
        },
      },
      include: recordInclude,
    });
    return created;
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'BILLING_STATUS',
    projectId: record.projectId,
    status: 'SUCCESS',
    meta,
    details: { billingRecordId: record.id, billingMonth: record.billingMonth, billingYear: record.billingYear, itemCount: input.items.length },
  });

  return getBillingRecord(req, record.id);
}

async function loadRecordAndAuthorize(req: Request, id: string) {
  const record = await prisma.billingRecord.findUnique({ where: { id }, include: recordInclude });
  if (!record) throw ApiError.notFound('Billing record not found');
  assertProjectAccess(req, record.projectId);
  return record;
}

export async function getBillingRecord(req: Request, id: string) {
  const record = await loadRecordAndAuthorize(req, id);
  const items = await prisma.billingItem.findMany({
    where: { billingRecordId: id },
    include: { createdBy: { select: { id: true, name: true } }, updatedBy: { select: { id: true, name: true } } },
    orderBy: { srNo: 'asc' },
  });
  return { ...record, items };
}

export interface UpdateBillingRecordInput {
  periodFrom?: Date | null;
  periodTo?: Date | null;
}

export async function updateBillingRecord(req: Request, id: string, input: UpdateBillingRecordInput, meta?: RequestMeta) {
  const existing = await loadRecordAndAuthorize(req, id);

  const record = await prisma.billingRecord.update({
    where: { id },
    data: {
      periodFrom: input.periodFrom !== undefined ? input.periodFrom : undefined,
      periodTo: input.periodTo !== undefined ? input.periodTo : undefined,
      updatedById: req.user!.sub,
    },
    include: recordInclude,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'BILLING_STATUS',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { billingRecordId: id, changes: input },
  });

  return record;
}

/// Deletes the header and — via ON DELETE CASCADE — every item under it.
/// Hard delete, same convention every other module in this app follows
/// (no soft-delete precedent exists anywhere in the schema); guarded by the
/// route's requirePermission('BILLING_STATUS','delete') and a frontend
/// confirmation dialog.
export async function deleteBillingRecord(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadRecordAndAuthorize(req, id);
  const itemCount = await prisma.billingItem.count({ where: { billingRecordId: id } });

  await prisma.billingRecord.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'BILLING_STATUS',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { billingRecordId: id, itemsDeleted: itemCount },
  });
}

export interface BillingItemFilters {
  projectId?: string;
  billingMonth?: number;
  billingYear?: number;
  periodFrom?: Date;
  periodTo?: Date;
  plantUnit?: string;
  status?: BillingItemStatus;
  invoiceNo?: string;
  jmsNo?: string;
}

function buildItemWhere(req: Request, filters: BillingItemFilters, search?: string): Prisma.BillingItemWhereInput {
  return {
    billingRecord: {
      ...projectScopeWhere(req),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.billingMonth ? { billingMonth: filters.billingMonth } : {}),
      ...(filters.billingYear ? { billingYear: filters.billingYear } : {}),
      ...(filters.periodFrom ? { periodFrom: { gte: filters.periodFrom } } : {}),
      ...(filters.periodTo ? { periodTo: { lte: filters.periodTo } } : {}),
    },
    ...(filters.plantUnit ? { plantUnit: { contains: filters.plantUnit, mode: 'insensitive' } } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.invoiceNo ? { invoiceNo: { contains: filters.invoiceNo, mode: 'insensitive' } } : {}),
    ...(filters.jmsNo ? { jmsNo: { contains: filters.jmsNo, mode: 'insensitive' } } : {}),
    ...(search
      ? {
          OR: [
            { plantUnit: { contains: search, mode: 'insensitive' } },
            { invoiceNo: { contains: search, mode: 'insensitive' } },
            { jmsNo: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

/// Main list view — flattened BillingItem rows (one per plant/unit bill)
/// joined with their parent record's project/month/year/period, matching
/// the item-level table the Billing Status page displays.
export async function listBillingItems(req: Request, pagination: PaginationParams, filters: BillingItemFilters) {
  const where = buildItemWhere(req, filters, pagination.search);

  const sortableTopLevel = new Set(['plantUnit', 'invoiceNo', 'jmsNo', 'abstractAmount', 'taxAmount', 'totalAmount', 'status', 'createdAt', 'srNo']);
  const sortBy = pagination.sortBy && sortableTopLevel.has(pagination.sortBy) ? pagination.sortBy : 'createdAt';

  const [rows, total] = await Promise.all([
    prisma.billingItem.findMany({
      where,
      include: itemInclude,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [sortBy]: pagination.sortOrder },
    }),
    prisma.billingItem.count({ where }),
  ]);

  return { rows, total };
}

export async function getBillingSummary(req: Request, filters: BillingItemFilters) {
  const where = buildItemWhere(req, filters);

  const [statusCounts, totals] = await Promise.all([
    prisma.billingItem.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.billingItem.aggregate({ where, _count: { _all: true }, _sum: { abstractAmount: true, taxAmount: true, totalAmount: true } }),
  ]);

  const statusMap: Record<BillingItemStatus, number> = {
    PENDING_CERTIFICATION: 0,
    A1_PENDING: 0,
    A2_PENDING: 0,
    ACCOUNTS_PENDING: 0,
    INVOICE_DONE: 0,
  };
  for (const row of statusCounts) statusMap[row.status] = row._count._all;

  return {
    totalBills: totals._count._all,
    totalAbstractAmount: Number(totals._sum.abstractAmount ?? 0),
    totalTaxAmount: Number(totals._sum.taxAmount ?? 0),
    totalAmount: Number(totals._sum.totalAmount ?? 0),
    statusCounts: statusMap,
  };
}

async function loadItemAndAuthorize(req: Request, itemId: string) {
  const item = await prisma.billingItem.findUnique({ where: { id: itemId }, include: itemInclude });
  if (!item) throw ApiError.notFound('Billing item not found');
  assertProjectAccess(req, item.billingRecord.projectId);
  return item;
}

export interface UpdateBillingItemInput {
  plantUnit?: string;
  invoiceNo?: string | null;
  jmsNo?: string | null;
  abstractAmount?: number;
  taxAmount?: number;
  status?: BillingItemStatus;
}

/// The one function every status-progression update (Pending Certification
/// -> A1 Pending -> ... -> Invoice Done) goes through. Recomputes
/// totalAmount server-side whenever either amount changes — never trusts a
/// client-submitted total — and records the before/after status (and
/// amounts, when changed) on the audit log entry so the change is
/// traceable, per the app's existing "details is a flexible JSON bag"
/// audit convention (no bespoke diff table).
export async function updateBillingItem(req: Request, itemId: string, input: UpdateBillingItemInput, meta?: RequestMeta) {
  const existing = await loadItemAndAuthorize(req, itemId);

  const nextAbstractAmount = input.abstractAmount ?? Number(existing.abstractAmount);
  const nextTaxAmount = input.taxAmount ?? Number(existing.taxAmount);
  const totalAmount = round2(nextAbstractAmount + nextTaxAmount);

  const item = await prisma.billingItem.update({
    where: { id: itemId },
    data: {
      plantUnit: input.plantUnit ?? undefined,
      invoiceNo: input.invoiceNo !== undefined ? input.invoiceNo || null : undefined,
      jmsNo: input.jmsNo !== undefined ? input.jmsNo || null : undefined,
      abstractAmount: input.abstractAmount ?? undefined,
      taxAmount: input.taxAmount ?? undefined,
      totalAmount,
      status: input.status ?? undefined,
      updatedById: req.user!.sub,
    },
    include: itemInclude,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'BILLING_STATUS',
    projectId: existing.billingRecord.projectId,
    status: 'SUCCESS',
    meta,
    details: {
      billingItemId: itemId,
      billingRecordId: existing.billingRecordId,
      oldStatus: existing.status,
      newStatus: item.status,
      oldAbstractAmount: Number(existing.abstractAmount),
      newAbstractAmount: Number(item.abstractAmount),
      oldTaxAmount: Number(existing.taxAmount),
      newTaxAmount: Number(item.taxAmount),
    },
  });

  return item;
}

/// Hard delete of a single line item — same reasoning as
/// deleteBillingRecord (no soft-delete precedent in this codebase).
export async function deleteBillingItem(req: Request, itemId: string, meta?: RequestMeta) {
  const existing = await loadItemAndAuthorize(req, itemId);

  await prisma.billingItem.delete({ where: { id: itemId } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'BILLING_STATUS',
    projectId: existing.billingRecord.projectId,
    status: 'SUCCESS',
    meta,
    details: { billingItemId: itemId, billingRecordId: existing.billingRecordId, plantUnit: existing.plantUnit },
  });
}
