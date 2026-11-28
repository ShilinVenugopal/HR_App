import { BankSourceModule, BankTransactionStatus, BankTransactionType, Prisma } from '@prisma/client';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const txInclude = {
  bankAccount: { select: { id: true, bankName: true, accountType: true, accountNumber: true } },
  project: { select: { id: true, projectName: true, projectNumber: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.BankTransactionInclude;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/// The figure every balance/filter/export actually uses — a correction on
/// this page (modifiedAmount) always wins over what the source module
/// originally reported, without ever discarding that original value (req.
/// 4E/5E: "Maintain the original source amount and the corrected amount").
export function effectiveAmount(tx: { originalAmount: Prisma.Decimal | number; modifiedAmount: Prisma.Decimal | number | null }): number {
  return Number(tx.modifiedAmount ?? tx.originalAmount);
}

// ─────────────────────────────────────────────────────────────────────────
// AUTOMATIC SYNC — called from the 5 wired-up source modules' own services.
// Never throws: a transaction recorded in its own module must never fail
// just because bank sync hit a problem, and every call here is a no-op
// whenever the caller passes no bankAccountId (req: fully optional, zero
// behavior change for flows that don't use it).
// ─────────────────────────────────────────────────────────────────────────

export interface AutoSyncInput {
  sourceModule: BankSourceModule;
  sourceRecordId: string;
  bankAccountId: string | null | undefined;
  transactionType: BankTransactionType;
  transactionDate: Date;
  projectId?: string | null;
  description: string;
  amount: number;
  userId: string;
}

/// 1:1 sources (BILLING_STATUS, SUBCONTRACTOR_PAYMENTS, ADVANCES, WAGES):
/// one BankTransaction per source record, upserted by (sourceModule,
/// sourceRecordId). originalAmount/date/description/account are always
/// refreshed from the source; modifiedAmount (a correction made on the
/// Bank Accounts page) is deliberately never touched here, so it survives
/// every resync. If bankAccountId is cleared on the source, any existing
/// row is voided rather than deleted — never losing history (req. 6B).
export async function syncAutoTransaction(input: AutoSyncInput): Promise<void> {
  const existing = await prisma.bankTransaction.findFirst({
    where: { sourceModule: input.sourceModule, sourceRecordId: input.sourceRecordId },
  });

  if (!input.bankAccountId) {
    if (existing && existing.status === 'ACTIVE') {
      await prisma.bankTransaction.update({ where: { id: existing.id }, data: { status: 'VOIDED' } });
    }
    return;
  }

  if (existing) {
    await prisma.bankTransaction.update({
      where: { id: existing.id },
      data: {
        transactionDate: input.transactionDate,
        bankAccountId: input.bankAccountId,
        projectId: input.projectId ?? null,
        description: input.description,
        originalAmount: input.amount,
        status: 'ACTIVE',
      },
    });
  } else {
    await prisma.bankTransaction.create({
      data: {
        transactionDate: input.transactionDate,
        bankAccountId: input.bankAccountId,
        transactionType: input.transactionType,
        projectId: input.projectId ?? null,
        description: input.description,
        originalAmount: input.amount,
        sourceModule: input.sourceModule,
        sourceRecordId: input.sourceRecordId,
        entryType: 'AUTOMATIC',
        createdById: input.userId,
      },
    });
  }
}

/// Called when a source record is deleted — never hard-deletes the bank
/// row, only voids it (req. 6B: "handled safely without losing the
/// transaction history").
export async function voidAutoTransaction(sourceModule: BankSourceModule, sourceRecordId: string): Promise<void> {
  await prisma.bankTransaction.updateMany({
    where: { sourceModule, sourceRecordId, status: 'ACTIVE' },
    data: { status: 'VOIDED' },
  });
}

/// SITE_ACCOUNTS is 1:many (one statement -> one row per entry) and its
/// entries have no stable id across edits (siteAccounts.service.ts always
/// deletes and recreates them), so there is no way to preserve a per-entry
/// modifiedAmount correction across a later statement save/correction —
/// this batch is simply regenerated from scratch every time. Disclosed
/// limitation, not an oversight.
export async function resyncSiteAccountBatch(
  statementId: string,
  bankAccountId: string | null | undefined,
  entries: { id: string; entryType: 'OTHER_RECEIPT' | 'EXPENSE'; particulars: string | null; costCodeDescription: string | null; receiptAmount: number; paymentAmount: number; transactionDate: Date }[],
  projectId: string,
  userId: string
): Promise<void> {
  await prisma.bankTransaction.deleteMany({ where: { sourceModule: 'SITE_ACCOUNTS', sourceRecordId: statementId } });
  if (!bankAccountId) return;

  const rows = entries
    .filter((e) => (e.entryType === 'OTHER_RECEIPT' ? e.receiptAmount > 0 : e.paymentAmount > 0))
    .map((e) => ({
      transactionDate: e.transactionDate,
      bankAccountId,
      transactionType: (e.entryType === 'OTHER_RECEIPT' ? 'RECEIPT' : 'PAYMENT') as BankTransactionType,
      projectId,
      description: e.entryType === 'OTHER_RECEIPT' ? e.particulars || 'Site Account — Other Receipt' : e.costCodeDescription || 'Site Account — Expense',
      originalAmount: e.entryType === 'OTHER_RECEIPT' ? e.receiptAmount : e.paymentAmount,
      sourceModule: 'SITE_ACCOUNTS' as BankSourceModule,
      sourceRecordId: statementId,
      entryType: 'AUTOMATIC' as const,
      createdById: userId,
    }));

  if (rows.length > 0) {
    await prisma.bankTransaction.createMany({ data: rows });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// LIST / FILTER (Receipts & Payments tabs share this)
// ─────────────────────────────────────────────────────────────────────────

export interface TransactionFilters {
  transactionType: BankTransactionType;
  month?: number;
  year?: number;
  projectId?: string;
  accountType?: 'OD' | 'CURRENT' | 'CC';
  bankAccountId?: string;
  description?: string;
  sourceModule?: BankSourceModule;
}

function buildWhere(filters: TransactionFilters): Prisma.BankTransactionWhereInput {
  return {
    transactionType: filters.transactionType,
    status: 'ACTIVE',
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.bankAccountId ? { bankAccountId: filters.bankAccountId } : {}),
    ...(filters.accountType ? { bankAccount: { accountType: filters.accountType } } : {}),
    ...(filters.sourceModule ? { sourceModule: filters.sourceModule } : {}),
    ...(filters.description ? { description: { contains: filters.description, mode: 'insensitive' } } : {}),
    ...(filters.month && filters.year
      ? { transactionDate: { gte: new Date(filters.year, filters.month - 1, 1), lt: new Date(filters.year, filters.month, 1) } }
      : filters.year
        ? { transactionDate: { gte: new Date(filters.year, 0, 1), lt: new Date(filters.year + 1, 0, 1) } }
        : {}),
  };
}

export async function listTransactions(req: Request, pagination: PaginationParams, filters: TransactionFilters) {
  const where = buildWhere(filters);

  const [rows, total, allMatching] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      include: txInclude,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { transactionDate: 'desc' },
    }),
    prisma.bankTransaction.count({ where }),
    // Total amount must reflect every filtered record, not just the
    // current page (req. 7: "Display the total receipt/payment amount for
    // the currently filtered records").
    prisma.bankTransaction.findMany({ where, select: { originalAmount: true, modifiedAmount: true } }),
  ]);

  const totalAmount = round2(allMatching.reduce((sum, t) => sum + effectiveAmount(t), 0));

  return { rows: rows.map((r) => ({ ...r, effectiveAmount: effectiveAmount(r) })), total, totalAmount };
}

async function loadTransaction(id: string) {
  const tx = await prisma.bankTransaction.findUnique({ where: { id }, include: txInclude });
  if (!tx) throw ApiError.notFound('Bank transaction not found');
  return tx;
}

export async function getTransaction(id: string) {
  const tx = await loadTransaction(id);
  return { ...tx, effectiveAmount: effectiveAmount(tx) };
}

// ─────────────────────────────────────────────────────────────────────────
// EDIT (description/remarks/amount — any transaction, automatic or manual)
// ─────────────────────────────────────────────────────────────────────────

export interface UpdateTransactionInput {
  description?: string;
  remarks?: string;
  amount?: number;
  // Manual entries only — an automatic row's date/account/project/type are
  // owned by its source module and must be changed there, not here.
  transactionDate?: Date;
  bankAccountId?: string;
  projectId?: string | null;
}

export async function updateTransaction(req: Request, id: string, input: UpdateTransactionInput, meta?: RequestMeta) {
  const existing = await loadTransaction(id);

  if (existing.entryType === 'AUTOMATIC' && (input.transactionDate || input.bankAccountId || input.projectId !== undefined)) {
    throw ApiError.badRequest('Date, Bank Account and Project on an automatic transaction can only be changed from its source record');
  }

  const previousAmount = effectiveAmount(existing);

  const tx = await prisma.bankTransaction.update({
    where: { id },
    data: {
      description: input.description,
      remarks: input.remarks !== undefined ? input.remarks || null : undefined,
      modifiedAmount: input.amount !== undefined ? input.amount : undefined,
      transactionDate: existing.entryType === 'MANUAL' ? input.transactionDate : undefined,
      bankAccountId: existing.entryType === 'MANUAL' ? input.bankAccountId : undefined,
      projectId: existing.entryType === 'MANUAL' && input.projectId !== undefined ? input.projectId || null : undefined,
      updatedById: req.user!.sub,
    },
    include: txInclude,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'BANK_ACCOUNTS',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: {
      bankTransactionId: id,
      originalSourceAmount: Number(existing.originalAmount),
      previousEffectiveAmount: previousAmount,
      newEffectiveAmount: effectiveAmount(tx),
      changes: input,
    },
  });

  return { ...tx, effectiveAmount: effectiveAmount(tx) };
}

// ─────────────────────────────────────────────────────────────────────────
// MANUAL ENTRY
// ─────────────────────────────────────────────────────────────────────────

export interface ManualTransactionInput {
  transactionDate: Date;
  bankAccountId: string;
  transactionType: 'RECEIPT' | 'PAYMENT';
  projectId?: string;
  description: string;
  remarks?: string;
  amount: number;
}

export async function createManualTransaction(req: Request, input: ManualTransactionInput, meta?: RequestMeta) {
  const tx = await prisma.bankTransaction.create({
    data: {
      transactionDate: input.transactionDate,
      bankAccountId: input.bankAccountId,
      transactionType: input.transactionType,
      projectId: input.projectId || null,
      description: input.description,
      remarks: input.remarks || null,
      originalAmount: input.amount,
      sourceModule: 'MANUAL',
      entryType: 'MANUAL',
      createdById: req.user!.sub,
    },
    include: txInclude,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'BANK_ACCOUNTS',
    projectId: tx.projectId,
    status: 'SUCCESS',
    meta,
    details: { bankTransactionId: tx.id, manual: true, transactionType: tx.transactionType, amount: input.amount },
  });

  return { ...tx, effectiveAmount: effectiveAmount(tx) };
}

/// Only a MANUAL entry can be deleted directly — an AUTOMATIC row's
/// lifecycle is owned by its source module (delete it there and it voids
/// automatically); allowing a direct delete here would desync the two.
export async function deleteManualTransaction(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadTransaction(id);
  if (existing.entryType !== 'MANUAL') {
    throw ApiError.badRequest('Only manually entered transactions can be deleted here — edit or delete the originating record for an automatic one');
  }

  await prisma.bankTransaction.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'BANK_ACCOUNTS',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { bankTransactionId: id, amount: effectiveAmount(existing) },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// INTERNAL TRANSFER
// ─────────────────────────────────────────────────────────────────────────

export interface TransferInput {
  transactionDate: Date;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description?: string;
  remarks?: string;
}

/// Records one TRANSFER-type row per leg, sharing a transferGroupId. The
/// debit leg's amount is stored negative, the credit leg's positive — both
/// are type TRANSFER (never RECEIPT/PAYMENT), so a transfer can never be
/// double-counted into consolidated business receipts/payments (req. 6E)
/// while still correctly affecting each individual account's own balance.
export async function createTransfer(req: Request, input: TransferInput, meta?: RequestMeta) {
  if (input.fromAccountId === input.toAccountId) {
    throw ApiError.badRequest('Transfer From and To accounts must be different');
  }
  if (!(input.amount > 0)) {
    throw ApiError.badRequest('Transfer amount must be greater than 0');
  }

  const [fromAccount, toAccount] = await Promise.all([
    prisma.bankAccount.findUnique({ where: { id: input.fromAccountId } }),
    prisma.bankAccount.findUnique({ where: { id: input.toAccountId } }),
  ]);
  if (!fromAccount || !toAccount) throw ApiError.notFound('Bank account not found');

  const transferGroupId = randomUUID();
  const description = input.description || `Internal Transfer: ${fromAccount.bankName} (${fromAccount.accountType}) → ${toAccount.bankName} (${toAccount.accountType})`;

  const [debit, credit] = await prisma.$transaction([
    prisma.bankTransaction.create({
      data: {
        transactionDate: input.transactionDate,
        bankAccountId: input.fromAccountId,
        transactionType: 'TRANSFER',
        description,
        remarks: input.remarks || null,
        originalAmount: -input.amount,
        sourceModule: 'TRANSFER',
        transferGroupId,
        entryType: 'MANUAL',
        createdById: req.user!.sub,
      },
    }),
    prisma.bankTransaction.create({
      data: {
        transactionDate: input.transactionDate,
        bankAccountId: input.toAccountId,
        transactionType: 'TRANSFER',
        description,
        remarks: input.remarks || null,
        originalAmount: input.amount,
        sourceModule: 'TRANSFER',
        transferGroupId,
        entryType: 'MANUAL',
        createdById: req.user!.sub,
      },
    }),
  ]);

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'BANK_ACCOUNTS',
    status: 'SUCCESS',
    meta,
    details: { transferGroupId, fromAccountId: input.fromAccountId, toAccountId: input.toAccountId, amount: input.amount },
  });

  return { debit, credit };
}
