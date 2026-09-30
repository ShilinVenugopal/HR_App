import { Prisma, SiteAccountEntryType } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const statementInclude = {
  project: { select: { id: true, projectName: true, projectNumber: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  entries: {
    include: { costCode: true, dates: { orderBy: { date: 'asc' as const } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.SiteAccountStatementInclude;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface EntryInput {
  entryType: SiteAccountEntryType;
  costCodeId?: string;
  voucherNo?: string;
  particulars?: string;
  dates?: Date[];
  receiptAmount?: number;
  depositAdvanceAmount?: number;
  paymentAmount?: number;
}

export interface CreateStatementInput {
  projectId: string;
  statementDate: Date;
  periodFrom: Date;
  periodTo: Date;
  openingBalance?: number;
  siteFundReceived?: number;
  entries?: EntryInput[];
}

function entryCreateData(entry: EntryInput, userId: string) {
  return {
    entryType: entry.entryType,
    costCodeId: entry.entryType === 'EXPENSE' ? entry.costCodeId : null,
    voucherNo: entry.voucherNo || null,
    particulars: entry.entryType === 'OTHER_RECEIPT' ? entry.particulars || null : null,
    receiptAmount: entry.receiptAmount ?? 0,
    depositAdvanceAmount: entry.depositAdvanceAmount ?? 0,
    paymentAmount: entry.entryType === 'EXPENSE' ? entry.paymentAmount ?? 0 : 0,
    createdById: userId,
    dates: entry.dates?.length ? { create: entry.dates.map((date) => ({ date })) } : undefined,
  };
}

export async function createStatement(req: Request, input: CreateStatementInput, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);

  const periodFrom = new Date(input.periodFrom);
  const statement = await prisma.$transaction(async (tx) => {
    return tx.siteAccountStatement.create({
      data: {
        projectId: input.projectId,
        statementDate: input.statementDate,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        statementMonth: periodFrom.getMonth() + 1,
        statementYear: periodFrom.getFullYear(),
        openingBalance: input.openingBalance ?? 0,
        siteFundReceived: input.siteFundReceived ?? 0,
        createdById: req.user!.sub,
        entries: { create: (input.entries ?? []).map((e) => entryCreateData(e, req.user!.sub)) },
      },
      include: statementInclude,
    });
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'SITE_ACCOUNTS',
    projectId: statement.projectId,
    status: 'SUCCESS',
    meta,
    details: { statementId: statement.id, statementMonth: statement.statementMonth, statementYear: statement.statementYear, entryCount: statement.entries.length },
  });

  return withComputedTotals(statement);
}

async function loadStatementAndAuthorize(req: Request, id: string) {
  const statement = await prisma.siteAccountStatement.findUnique({ where: { id }, include: statementInclude });
  if (!statement) throw ApiError.notFound('Site Account statement not found');
  assertProjectAccess(req, statement.projectId);
  return statement;
}

/// The route only confirms the caller holds *some* relevant SITE_ACCOUNTS
/// capability (requireEditOrApprove/requirePermission) — it can't know the
/// statement's status ahead of loading the record. This is the precise
/// gate on top: a DRAFT statement is governed by the ordinary canEdit/
/// canDelete flags, but once SAVED, the site team's canEdit no longer
/// applies — only a user holding canApprove ("granted by Super Admin for
/// corrections", per the design brief) may still mutate it. Delete is
/// unaffected by canApprove: deleteStatement() only ever calls this once
/// existing.status is already known to be DRAFT (a SAVED statement can
/// never be deleted, correction rights or not — only amended in place).
export function assertCanMutateStatement(req: Request, statementStatus: 'DRAFT' | 'SAVED', action: 'edit' | 'delete') {
  if (req.user!.role === 'SUPER_ADMIN') return;
  const claim = req.user!.permissions['SITE_ACCOUNTS'];

  if (statementStatus === 'DRAFT') {
    const allowed = action === 'edit' ? claim?.canEdit : claim?.canDelete;
    if (!allowed) throw ApiError.forbidden(`You do not have permission to ${action} this statement`);
    return;
  }

  if (!claim?.canApprove) {
    throw ApiError.forbidden('This statement has been saved and can only be edited by a user with correction rights');
  }
}

function computeTotals(statement: { openingBalance: Prisma.Decimal | number; siteFundReceived: Prisma.Decimal | number; entries: { entryType: SiteAccountEntryType; receiptAmount: Prisma.Decimal | number; depositAdvanceAmount: Prisma.Decimal | number; paymentAmount: Prisma.Decimal | number; costCode?: { code: string; parentCode: string | null } | null }[] }) {
  const openingBalance = Number(statement.openingBalance);
  const siteFundReceived = Number(statement.siteFundReceived);

  const otherReceipts = statement.entries.filter((e) => e.entryType === 'OTHER_RECEIPT').reduce((sum, e) => sum + Number(e.receiptAmount), 0);
  const totalDepositsAdvances = statement.entries.reduce((sum, e) => sum + Number(e.depositAdvanceAmount), 0);
  const totalPayments = statement.entries
    .filter((e) => e.entryType === 'EXPENSE')
    .reduce((sum, e) => sum + Number(e.paymentAmount), 0);

  const totalReceipts = round2(openingBalance + siteFundReceived + otherReceipts);
  const balanceInHand = round2(totalReceipts - round2(totalPayments));

  return {
    totalReceipts,
    totalDepositsAdvances: round2(totalDepositsAdvances),
    totalPayments: round2(totalPayments),
    balanceInHand,
  };
}

/// Subtotal rows (F01/F02/F03 only, per hasSubtotal on the master) are
/// purely a computed display aggregate — sum of the group's own EXPENSE
/// payments — and are never stored or folded back into totalPayments, so
/// there is no double-counting risk by construction.
async function computeSubtotals(entries: { entryType: SiteAccountEntryType; paymentAmount: Prisma.Decimal | number; costCode?: { code: string; parentCode: string | null } | null }[]) {
  const groupCodes = await prisma.siteAccountCostCode.findMany({ where: { hasSubtotal: true }, select: { code: true } });
  const subtotals: Record<string, number> = {};

  for (const group of groupCodes) {
    const sum = entries
      .filter((e) => e.entryType === 'EXPENSE' && e.costCode && (e.costCode.code === group.code || e.costCode.parentCode === group.code))
      .reduce((acc, e) => acc + Number(e.paymentAmount), 0);
    subtotals[group.code] = round2(sum);
  }

  return subtotals;
}

async function withComputedTotals<T extends Parameters<typeof computeTotals>[0]>(statement: T) {
  const totals = computeTotals(statement);
  const subtotals = await computeSubtotals(statement.entries);
  return { ...statement, totals, subtotals };
}

export async function getStatement(req: Request, id: string) {
  const statement = await loadStatementAndAuthorize(req, id);
  return withComputedTotals(statement);
}

export interface StatementFilters {
  projectId?: string;
  projectNumber?: string;
  periodFrom?: Date;
  periodTo?: Date;
  statementMonth?: number;
  statementYear?: number;
  status?: 'DRAFT' | 'SAVED';
  voucherNo?: string;
  costCode?: string;
}

export async function listStatements(req: Request, pagination: PaginationParams, filters: StatementFilters) {
  const where: Prisma.SiteAccountStatementWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.projectNumber ? { project: { projectNumber: { contains: filters.projectNumber, mode: 'insensitive' } } } : {}),
    ...(filters.periodFrom ? { periodFrom: { gte: filters.periodFrom } } : {}),
    ...(filters.periodTo ? { periodTo: { lte: filters.periodTo } } : {}),
    ...(filters.statementMonth ? { statementMonth: filters.statementMonth } : {}),
    ...(filters.statementYear ? { statementYear: filters.statementYear } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.voucherNo ? { entries: { some: { voucherNo: { contains: filters.voucherNo, mode: 'insensitive' } } } } : {}),
    ...(filters.costCode ? { entries: { some: { costCode: { code: filters.costCode } } } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.siteAccountStatement.findMany({
      where,
      include: statementInclude,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'createdAt']: pagination.sortOrder },
    }),
    prisma.siteAccountStatement.count({ where }),
  ]);

  const withTotals = await Promise.all(rows.map((r) => withComputedTotals(r)));
  return { rows: withTotals, total };
}

export type UpdateStatementInput = Partial<Omit<CreateStatementInput, 'projectId'>>;

/// Whole-grid update: header fields are patched individually, and when
/// `entries` is present the entire entry list is replaced in one
/// transaction (same "delete then recreate" convention PurchaseOrder/PR
/// item grids already use) — simpler and less error-prone than diffing a
/// free-form accounting grid row by row.
export async function updateStatement(req: Request, id: string, input: UpdateStatementInput, meta?: RequestMeta) {
  const existing = await loadStatementAndAuthorize(req, id);
  assertCanMutateStatement(req, existing.status, 'edit');

  const beforeTotals = computeTotals(existing);

  const statement = await prisma.$transaction(async (tx) => {
    if (input.entries) {
      await tx.siteAccountEntry.deleteMany({ where: { statementId: id } });
    }
    return tx.siteAccountStatement.update({
      where: { id },
      data: {
        statementDate: input.statementDate,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        statementMonth: input.periodFrom ? new Date(input.periodFrom).getMonth() + 1 : undefined,
        statementYear: input.periodFrom ? new Date(input.periodFrom).getFullYear() : undefined,
        openingBalance: input.openingBalance,
        siteFundReceived: input.siteFundReceived,
        updatedById: req.user!.sub,
        entries: input.entries ? { create: input.entries.map((e) => entryCreateData(e, req.user!.sub)) } : undefined,
      },
      include: statementInclude,
    });
  });

  const afterTotals = computeTotals(statement);

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'SITE_ACCOUNTS',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: {
      statementId: id,
      correctedWhileSaved: existing.status === 'SAVED',
      previousTotalPayments: beforeTotals.totalPayments,
      newTotalPayments: afterTotals.totalPayments,
      previousTotalReceipts: beforeTotals.totalReceipts,
      newTotalReceipts: afterTotals.totalReceipts,
      newEntries: input.entries
        ? input.entries.map((e) => ({ entryType: e.entryType, costCodeId: e.costCodeId, voucherNo: e.voucherNo, paymentAmount: e.paymentAmount }))
        : undefined,
    },
  });

  return withComputedTotals(statement);
}

/// "Save Statement" — the explicit DRAFT -> SAVED transition performed by
/// the site team once data entry is complete. From then on, only a
/// canApprove holder can edit it (assertCanMutateStatement).
export async function saveStatement(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadStatementAndAuthorize(req, id);
  if (existing.status !== 'DRAFT') {
    throw ApiError.badRequest('This statement has already been saved');
  }
  assertCanMutateStatement(req, existing.status, 'edit');

  const statement = await prisma.siteAccountStatement.update({
    where: { id },
    data: { status: 'SAVED', updatedById: req.user!.sub },
    include: statementInclude,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'SITE_ACCOUNTS',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { statementId: id, saved: true },
  });

  return withComputedTotals(statement);
}

export async function deleteStatement(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadStatementAndAuthorize(req, id);
  // Deletion is a DRAFT-only operation regardless of correction rights —
  // once SAVED, a statement can only be amended in place, never deleted.
  if (existing.status !== 'DRAFT') {
    throw ApiError.badRequest('Only Draft statements can be deleted');
  }
  assertCanMutateStatement(req, existing.status, 'delete');

  await prisma.siteAccountStatement.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'SITE_ACCOUNTS',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { statementId: id },
  });
}

export async function listCostCodes() {
  return prisma.siteAccountCostCode.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } });
}
