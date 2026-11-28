import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';
import { effectiveAmount } from '../bankTransactions/bankTransactions.service';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const txInclude = {
  bankAccount: { select: { id: true, bankName: true, accountType: true, accountNumber: true } },
  project: { select: { id: true, projectName: true, projectNumber: true } },
} satisfies Prisma.BankTransactionInclude;

/// Opening + Total Receipts - Total Payments + net internal transfers for
/// one account over one period (req. 8B). Internal transfers are excluded
/// from Total Receipts/Total Payments (req. 6E — never business income or
/// expense) but still physically move cash in/out of THIS account, so
/// they're folded into the closing balance under their own netTransfers
/// figure rather than silently vanishing from the account's own math.
async function computeAccountStatement(bankAccountId: string, periodFrom: Date, periodTo: Date) {
  const account = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
  if (!account) throw ApiError.notFound('Bank account not found');

  const [beforePeriod, receipts, payments, transfers] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { bankAccountId, status: 'ACTIVE', transactionDate: { lt: periodFrom } },
      select: { transactionType: true, originalAmount: true, modifiedAmount: true },
    }),
    prisma.bankTransaction.findMany({
      where: { bankAccountId, status: 'ACTIVE', transactionType: 'RECEIPT', transactionDate: { gte: periodFrom, lte: periodTo } },
      include: txInclude,
      orderBy: { transactionDate: 'desc' },
    }),
    prisma.bankTransaction.findMany({
      where: { bankAccountId, status: 'ACTIVE', transactionType: 'PAYMENT', transactionDate: { gte: periodFrom, lte: periodTo } },
      include: txInclude,
      orderBy: { transactionDate: 'desc' },
    }),
    prisma.bankTransaction.findMany({
      where: { bankAccountId, status: 'ACTIVE', transactionType: 'TRANSFER', transactionDate: { gte: periodFrom, lte: periodTo } },
      select: { originalAmount: true, modifiedAmount: true },
    }),
  ]);

  const priorNet = round2(
    beforePeriod.reduce((sum, t) => {
      const amt = effectiveAmount(t);
      return sum + (t.transactionType === 'PAYMENT' ? -amt : amt); // RECEIPT and TRANSFER are both already signed correctly for TRANSFER (+/-), RECEIPT is always positive
    }, 0)
  );
  const openingBalance = round2(Number(account.openingBalance) + priorNet);
  const totalReceipts = round2(receipts.reduce((sum, t) => sum + effectiveAmount(t), 0));
  const totalPayments = round2(payments.reduce((sum, t) => sum + effectiveAmount(t), 0));
  const netTransfers = round2(transfers.reduce((sum, t) => sum + effectiveAmount(t), 0));
  const closingBookBalance = round2(openingBalance + totalReceipts - totalPayments + netTransfers);

  return {
    bankAccount: { id: account.id, bankName: account.bankName, accountType: account.accountType, accountNumber: account.accountNumber },
    openingBalance,
    totalReceipts,
    totalPayments,
    netTransfers,
    closingBookBalance,
    receipts: receipts.map((r) => ({ ...r, effectiveAmount: effectiveAmount(r) })),
    payments: payments.map((p) => ({ ...p, effectiveAmount: effectiveAmount(p) })),
  };
}

export interface GenerateStatementInput {
  bankAccountId: string | 'BOTH';
  periodFrom: Date;
  periodTo: Date;
}

/// Read-only preview — "Both Accounts" sums every ACTIVE account's own
/// statement into one combined view (req. 8A) without ever being persisted
/// as a single synthetic reconciliation row (see saveReconciliation).
export async function generateStatement(input: GenerateStatementInput) {
  if (input.bankAccountId === 'BOTH') {
    const accounts = await prisma.bankAccount.findMany({ where: { status: 'ACTIVE' } });
    const perAccount = await Promise.all(accounts.map((a) => computeAccountStatement(a.id, input.periodFrom, input.periodTo)));
    return {
      combined: true,
      accounts: perAccount,
      openingBalance: round2(perAccount.reduce((s, a) => s + a.openingBalance, 0)),
      totalReceipts: round2(perAccount.reduce((s, a) => s + a.totalReceipts, 0)),
      totalPayments: round2(perAccount.reduce((s, a) => s + a.totalPayments, 0)),
      netTransfers: round2(perAccount.reduce((s, a) => s + a.netTransfers, 0)),
      closingBookBalance: round2(perAccount.reduce((s, a) => s + a.closingBookBalance, 0)),
      receipts: perAccount.flatMap((a) => a.receipts),
      payments: perAccount.flatMap((a) => a.payments),
    };
  }

  const statement = await computeAccountStatement(input.bankAccountId, input.periodFrom, input.periodTo);
  return { combined: false, accounts: [statement], ...statement };
}

export interface SaveReconciliationInput {
  bankAccountId: string | 'BOTH';
  periodFrom: Date;
  periodTo: Date;
  bankStatementBalance: number;
  bankStatementDate?: Date;
  bankStatementRemarks?: string;
  remarks?: string;
}

const reconciliationInclude = {
  bankAccount: { select: { id: true, bankName: true, accountType: true, accountNumber: true } },
  reconciledBy: { select: { id: true, name: true } },
} satisfies Prisma.BankReconciliationInclude;

/// Always INSERTs — never updates/overwrites a previous statement (req.
/// 8F: "Do not overwrite previously completed reconciliation records when
/// generating a new statement"). "Both Accounts" saves one row per active
/// account (each against the SAME bankStatementBalance would be wrong, so
/// this path is only reachable with a single account — see validation);
/// book-side figures are always recomputed fresh server-side, never
/// trusted from the client.
export async function saveReconciliation(req: Request, input: SaveReconciliationInput, meta?: RequestMeta) {
  if (input.bankAccountId === 'BOTH') {
    throw ApiError.badRequest('Select one specific bank account to save a reconciliation statement — "Both" is a combined preview only');
  }

  const statement = await computeAccountStatement(input.bankAccountId, input.periodFrom, input.periodTo);
  const reconciliationDifference = round2(statement.closingBookBalance - input.bankStatementBalance);
  const reconciliationStatus = Math.abs(reconciliationDifference) < 0.01 ? 'RECONCILED' : 'RECONCILIATION_REQUIRED';

  const record = await prisma.bankReconciliation.create({
    data: {
      bankAccountId: input.bankAccountId,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      openingBalance: statement.openingBalance,
      totalReceipts: statement.totalReceipts,
      totalPayments: statement.totalPayments,
      closingBookBalance: statement.closingBookBalance,
      bankStatementBalance: input.bankStatementBalance,
      bankStatementDate: input.bankStatementDate || null,
      bankStatementRemarks: input.bankStatementRemarks || null,
      reconciliationDifference,
      reconciliationStatus,
      remarks: input.remarks || null,
      reconciledById: req.user!.sub,
    },
    include: reconciliationInclude,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'BANK_ACCOUNTS',
    status: 'SUCCESS',
    meta,
    details: {
      reconciliationId: record.id,
      bankAccountId: input.bankAccountId,
      closingBookBalance: statement.closingBookBalance,
      bankStatementBalance: input.bankStatementBalance,
      reconciliationDifference,
      reconciliationStatus,
    },
  });

  return record;
}

export interface ReconciliationHistoryFilters {
  bankAccountId?: string;
}

export async function listReconciliationHistory(pagination: PaginationParams, filters: ReconciliationHistoryFilters) {
  const where: Prisma.BankReconciliationWhereInput = filters.bankAccountId ? { bankAccountId: filters.bankAccountId } : {};
  const [rows, total] = await Promise.all([
    prisma.bankReconciliation.findMany({
      where,
      include: reconciliationInclude,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { reconciledAt: 'desc' },
    }),
    prisma.bankReconciliation.count({ where }),
  ]);
  return { rows, total };
}
