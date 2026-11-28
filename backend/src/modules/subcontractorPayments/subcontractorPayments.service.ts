import { Prisma, SubcontractorPaymentStatus } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';
import { syncAutoTransaction, voidAutoTransaction } from '../bankTransactions/bankTransactions.service';

const DUE_DAYS = 30;

const billInclude = {
  project: { select: { id: true, projectName: true, projectNumber: true } },
  subcontractor: { select: { id: true, companyName: true, contractingType: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.SubcontractorBillInclude;

const paymentInclude = {
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  bankAccount: { select: { id: true, bankName: true, accountType: true, accountNumber: true } },
} satisfies Prisma.SubcontractorPaymentTransactionInclude;

const billWithPaymentsInclude = {
  ...billInclude,
  payments: { include: paymentInclude, orderBy: { paymentDate: 'asc' as const } },
} satisfies Prisma.SubcontractorBillInclude;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type SubcontractorBillPaymentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID';

export interface ComputedBillFields {
  totalPaidAmount: number;
  totalPaidGstAmount: number;
  totalPaidTdsAmount: number;
  totalProcessedAmount: number;
  totalProcessedGstAmount: number;
  totalProcessedTdsAmount: number;
  outstandingAmount: number;
  remainingGstBalance: number;
  remainingTdsBalance: number;
  paymentStatus: SubcontractorBillPaymentStatus;
  dueDate: Date;
  isOverdue: boolean;
}

type PaymentLike = {
  amountProcessed: Prisma.Decimal | number;
  gstAmountProcessed: Prisma.Decimal | number;
  tdsAmountDeducted: Prisma.Decimal | number;
  status: SubcontractorPaymentStatus;
};

/// Only PAID entries settle the bill's balances — req. 4.E: "Only entries
/// marked Paid should reduce the actual outstanding payment balance.
/// Entries marked Processed but not yet Paid should be displayed
/// separately as payment processing in progress." GST/TDS are each their
/// own running total, never folded back into amountProcessed, so Net
/// Payable (which already has TDS removed once, at bill level) is never
/// reduced a second time by the TDS component, and GST isn't counted
/// twice either — req. 4.E's "Important calculation rules".
function computeBillFields(
  bill: { invoiceDate: Date; netPayableAmount: Prisma.Decimal | number; gstAmount: Prisma.Decimal | number; tdsAmount: Prisma.Decimal | number; payments: PaymentLike[] }
): ComputedBillFields {
  const netPayableAmount = Number(bill.netPayableAmount);
  const gstAmount = Number(bill.gstAmount);
  const tdsAmount = Number(bill.tdsAmount);

  const paid = bill.payments.filter((p) => p.status === 'PAID');
  const totalPaidAmount = round2(paid.reduce((sum, p) => sum + Number(p.amountProcessed), 0));
  const totalPaidGstAmount = round2(paid.reduce((sum, p) => sum + Number(p.gstAmountProcessed), 0));
  const totalPaidTdsAmount = round2(paid.reduce((sum, p) => sum + Number(p.tdsAmountDeducted), 0));

  const totalProcessedAmount = round2(bill.payments.reduce((sum, p) => sum + Number(p.amountProcessed), 0));
  const totalProcessedGstAmount = round2(bill.payments.reduce((sum, p) => sum + Number(p.gstAmountProcessed), 0));
  const totalProcessedTdsAmount = round2(bill.payments.reduce((sum, p) => sum + Number(p.tdsAmountDeducted), 0));

  const outstandingAmount = round2(netPayableAmount - totalPaidAmount);
  const remainingGstBalance = round2(gstAmount - totalPaidGstAmount);
  const remainingTdsBalance = round2(tdsAmount - totalPaidTdsAmount);

  let paymentStatus: SubcontractorBillPaymentStatus;
  if (totalPaidAmount <= 0) paymentStatus = 'PENDING';
  else if (totalPaidAmount >= netPayableAmount) paymentStatus = 'PAID';
  else paymentStatus = 'PARTIALLY_PAID';

  const dueDate = addDays(bill.invoiceDate, DUE_DAYS);
  const isOverdue = startOfDay(new Date()).getTime() >= startOfDay(dueDate).getTime() && outstandingAmount > 0;

  return {
    totalPaidAmount,
    totalPaidGstAmount,
    totalPaidTdsAmount,
    totalProcessedAmount,
    totalProcessedGstAmount,
    totalProcessedTdsAmount,
    outstandingAmount,
    remainingGstBalance,
    remainingTdsBalance,
    paymentStatus,
    dueDate,
    isOverdue,
  };
}

export interface SubcontractorBillInput {
  projectId: string;
  subcontractorId: string;
  billingMonth: number;
  billingYear: number;
  invoiceNumber: string;
  invoiceDate: Date;
  foraysWoNumber?: string;
  basicAmount: number;
  additionalAmount?: number;
  additionalAmountType?: string;
  gstAmount?: number;
  tdsPercentage?: number;
  tdsAmount?: number;
  tdsCalculationMode?: 'AUTO' | 'MANUAL';
  tollAmount?: number;
  remarks?: string;
}

/// grossBillAmount/netPayableAmount are always server-computed — never
/// trusted from the client (same rule PO/GRN/Wages totals follow).
/// tdsAmount is the one field with an explicit manual-override affordance
/// (req. 3.B): in AUTO mode it's recomputed from basicAmount * tdsPercentage
/// / 100 here; in MANUAL mode the caller's own figure is kept as-is.
function computeAmounts(input: { basicAmount: number; additionalAmount: number; gstAmount: number; tollAmount: number; tdsPercentage?: number; tdsAmount: number; tdsCalculationMode: 'AUTO' | 'MANUAL' }) {
  const tdsAmount =
    input.tdsCalculationMode === 'AUTO' && input.tdsPercentage
      ? round2((input.basicAmount * input.tdsPercentage) / 100)
      : round2(input.tdsAmount);
  const grossBillAmount = round2(input.basicAmount + input.additionalAmount + input.gstAmount + input.tollAmount);
  const netPayableAmount = round2(grossBillAmount - tdsAmount);
  return { tdsAmount, grossBillAmount, netPayableAmount };
}

async function assertNoDuplicateInvoice(subcontractorId: string, invoiceNumber: string, excludeBillId?: string) {
  const duplicate = await prisma.subcontractorBill.findFirst({
    where: { subcontractorId, invoiceNumber, ...(excludeBillId ? { id: { not: excludeBillId } } : {}) },
  });
  if (duplicate) {
    throw ApiError.conflict('This subcontractor already has a bill recorded against this Invoice Number');
  }
}

export async function createSubcontractorBill(req: Request, input: SubcontractorBillInput, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);
  await assertNoDuplicateInvoice(input.subcontractorId, input.invoiceNumber);

  const additionalAmount = input.additionalAmount ?? 0;
  const gstAmount = input.gstAmount ?? 0;
  const tollAmount = input.tollAmount ?? 0;
  const tdsCalculationMode = input.tdsCalculationMode ?? 'AUTO';
  const { tdsAmount, grossBillAmount, netPayableAmount } = computeAmounts({
    basicAmount: input.basicAmount,
    additionalAmount,
    gstAmount,
    tollAmount,
    tdsPercentage: input.tdsPercentage,
    tdsAmount: input.tdsAmount ?? 0,
    tdsCalculationMode,
  });

  const bill = await prisma.subcontractorBill.create({
    data: {
      projectId: input.projectId,
      subcontractorId: input.subcontractorId,
      billingMonth: input.billingMonth,
      billingYear: input.billingYear,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      foraysWoNumber: input.foraysWoNumber || null,
      basicAmount: input.basicAmount,
      additionalAmount,
      additionalAmountType: (input.additionalAmountType as never) || null,
      gstAmount,
      tdsPercentage: input.tdsPercentage ?? null,
      tdsAmount,
      tdsCalculationMode,
      tollAmount,
      grossBillAmount,
      netPayableAmount,
      remarks: input.remarks || null,
      createdById: req.user!.sub,
    },
    include: billWithPaymentsInclude,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'SUBCONTRACTORS',
    projectId: bill.projectId,
    status: 'SUCCESS',
    meta,
    details: { billId: bill.id, subcontractorId: bill.subcontractorId, invoiceNumber: bill.invoiceNumber, netPayableAmount },
  });

  return { ...bill, ...computeBillFields(bill) };
}

async function loadBillAndAuthorize(req: Request, id: string) {
  const bill = await prisma.subcontractorBill.findUnique({ where: { id }, include: billWithPaymentsInclude });
  if (!bill) throw ApiError.notFound('Subcontractor bill not found');
  assertProjectAccess(req, bill.projectId);
  return bill;
}

export async function getSubcontractorBill(req: Request, id: string) {
  const bill = await loadBillAndAuthorize(req, id);
  return { ...bill, ...computeBillFields(bill) };
}

export type UpdateSubcontractorBillInput = Partial<SubcontractorBillInput>;

export async function updateSubcontractorBill(req: Request, id: string, input: UpdateSubcontractorBillInput, meta?: RequestMeta) {
  const existing = await loadBillAndAuthorize(req, id);

  if (input.invoiceNumber && input.invoiceNumber !== existing.invoiceNumber) {
    await assertNoDuplicateInvoice(existing.subcontractorId, input.invoiceNumber, id);
  }

  const basicAmount = input.basicAmount ?? Number(existing.basicAmount);
  const additionalAmount = input.additionalAmount ?? Number(existing.additionalAmount);
  const gstAmount = input.gstAmount ?? Number(existing.gstAmount);
  const tollAmount = input.tollAmount ?? Number(existing.tollAmount);
  const tdsPercentage = input.tdsPercentage !== undefined ? input.tdsPercentage ?? undefined : existing.tdsPercentage ?? undefined;
  const tdsCalculationMode = input.tdsCalculationMode ?? existing.tdsCalculationMode;
  const { tdsAmount, grossBillAmount, netPayableAmount } = computeAmounts({
    basicAmount,
    additionalAmount,
    gstAmount,
    tollAmount,
    tdsPercentage,
    tdsAmount: input.tdsAmount ?? Number(existing.tdsAmount),
    tdsCalculationMode,
  });

  // Req. 4.E/"authorized correction": a plain edit must never silently push
  // a bill's balances below what Paid payments have already consumed
  // against it — that would make the outstanding figures negative without
  // anyone having actually refunded anything.
  const paid = existing.payments.filter((p) => p.status === 'PAID');
  const paidAmount = round2(paid.reduce((sum, p) => sum + Number(p.amountProcessed), 0));
  const paidGst = round2(paid.reduce((sum, p) => sum + Number(p.gstAmountProcessed), 0));
  const paidTds = round2(paid.reduce((sum, p) => sum + Number(p.tdsAmountDeducted), 0));
  if (netPayableAmount < paidAmount) {
    throw ApiError.badRequest(`Net Payable Amount (₹${netPayableAmount}) cannot be reduced below the ₹${paidAmount} already paid against this bill`);
  }
  if (gstAmount < paidGst) {
    throw ApiError.badRequest(`GST Amount (₹${gstAmount}) cannot be reduced below the ₹${paidGst} already processed as paid`);
  }
  if (tdsAmount < paidTds) {
    throw ApiError.badRequest(`TDS Amount (₹${tdsAmount}) cannot be reduced below the ₹${paidTds} already deducted on paid transactions`);
  }

  const bill = await prisma.subcontractorBill.update({
    where: { id },
    data: {
      projectId: input.projectId,
      subcontractorId: input.subcontractorId,
      billingMonth: input.billingMonth,
      billingYear: input.billingYear,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      foraysWoNumber: input.foraysWoNumber !== undefined ? input.foraysWoNumber || null : undefined,
      basicAmount: input.basicAmount,
      additionalAmount: input.additionalAmount,
      additionalAmountType: input.additionalAmountType !== undefined ? (input.additionalAmountType as never) || null : undefined,
      gstAmount: input.gstAmount,
      tdsPercentage: input.tdsPercentage !== undefined ? input.tdsPercentage : undefined,
      tdsAmount,
      tdsCalculationMode,
      tollAmount: input.tollAmount,
      grossBillAmount,
      netPayableAmount,
      remarks: input.remarks !== undefined ? input.remarks || null : undefined,
      updatedById: req.user!.sub,
    },
    include: billWithPaymentsInclude,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'SUBCONTRACTORS',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { billId: id, changes: input },
  });

  return { ...bill, ...computeBillFields(bill) };
}

/// Hard delete of the bill and — via ON DELETE CASCADE — every payment
/// transaction under it. Guarded by requirePermission('SUBCONTRACTORS',
/// 'delete') and a frontend confirmation dialog, same convention as every
/// other delete in this codebase.
export async function deleteSubcontractorBill(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadBillAndAuthorize(req, id);

  await prisma.subcontractorBill.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'SUBCONTRACTORS',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { billId: id, invoiceNumber: existing.invoiceNumber, paymentsDeleted: existing.payments.length },
  });
}

export interface SubcontractorBillFilters {
  projectId?: string;
  subcontractorId?: string;
  billingMonth?: number;
  billingYear?: number;
  invoiceNumber?: string;
  paymentStatus?: SubcontractorBillPaymentStatus;
}

function buildBillWhere(req: Request, filters: SubcontractorBillFilters, search?: string): Prisma.SubcontractorBillWhereInput {
  return {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.subcontractorId ? { subcontractorId: filters.subcontractorId } : {}),
    ...(filters.billingMonth ? { billingMonth: filters.billingMonth } : {}),
    ...(filters.billingYear ? { billingYear: filters.billingYear } : {}),
    ...(filters.invoiceNumber ? { invoiceNumber: { contains: filters.invoiceNumber, mode: 'insensitive' } } : {}),
    ...(search
      ? {
          OR: [
            { invoiceNumber: { contains: search, mode: 'insensitive' } },
            { foraysWoNumber: { contains: search, mode: 'insensitive' } },
            { subcontractor: { companyName: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}

/// Default view for the Subcontractor Payments page — every saved bill,
/// descending by billing year/month then invoice date (req. #6: "Do not
/// make the user select a month or project to see the records" / "latest
/// first"). paymentStatus is a derived field, so filtering on it happens
/// in-memory after computing it for each row (the DB can't filter on a
/// value it doesn't store) — fine at this scale, same approach every other
/// derived-status filter in this app takes when the status isn't a stored
/// column.
export async function listSubcontractorBills(req: Request, pagination: PaginationParams, filters: SubcontractorBillFilters) {
  const where = buildBillWhere(req, filters, pagination.search);

  if (!filters.paymentStatus) {
    const sortableTopLevel = new Set(['invoiceNumber', 'invoiceDate', 'basicAmount', 'grossBillAmount', 'netPayableAmount', 'billingMonth', 'billingYear', 'createdAt']);
    const sortBy = pagination.sortBy && sortableTopLevel.has(pagination.sortBy) ? pagination.sortBy : undefined;

    const [rows, total] = await Promise.all([
      prisma.subcontractorBill.findMany({
        where,
        include: billWithPaymentsInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: sortBy ? { [sortBy]: pagination.sortOrder } : [{ billingYear: 'desc' }, { billingMonth: 'desc' }, { invoiceDate: 'desc' }],
      }),
      prisma.subcontractorBill.count({ where }),
    ]);

    return { rows: rows.map((r) => ({ ...r, ...computeBillFields(r) })), total };
  }

  // paymentStatus filter requested: compute for every matching row, filter
  // in-memory, then paginate the filtered set.
  const all = await prisma.subcontractorBill.findMany({
    where,
    include: billWithPaymentsInclude,
    orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }, { invoiceDate: 'desc' }],
  });
  const enriched = all.map((r) => ({ ...r, ...computeBillFields(r) })).filter((r) => r.paymentStatus === filters.paymentStatus);
  const total = enriched.length;
  const rows = enriched.slice(pagination.skip, pagination.skip + pagination.take);
  return { rows, total };
}

/// Totals for every bill matching the current filters (not just the
/// current page) — req. #6: "Display the total amounts for the currently
/// filtered records."
export async function getSubcontractorBillTotals(req: Request, filters: SubcontractorBillFilters) {
  const where = buildBillWhere(req, filters);
  const rows = await prisma.subcontractorBill.findMany({ where, include: billWithPaymentsInclude });
  const enriched = rows.map((r) => ({ ...r, ...computeBillFields(r) })).filter((r) => !filters.paymentStatus || r.paymentStatus === filters.paymentStatus);

  const sum = (fn: (r: (typeof enriched)[number]) => number) => round2(enriched.reduce((s, r) => s + fn(r), 0));

  return {
    totalBills: enriched.length,
    totalBasicAmount: sum((r) => Number(r.basicAmount)),
    totalAdditionalAmount: sum((r) => Number(r.additionalAmount)),
    totalGstAmount: sum((r) => Number(r.gstAmount)),
    totalTollAmount: sum((r) => Number(r.tollAmount)),
    totalTdsAmount: sum((r) => Number(r.tdsAmount)),
    totalGrossBillAmount: sum((r) => Number(r.grossBillAmount)),
    totalNetPayableAmount: sum((r) => Number(r.netPayableAmount)),
    totalAmountPaid: sum((r) => r.totalPaidAmount),
    totalOutstandingAmount: sum((r) => r.outstandingAmount),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// PAYMENT PROCESSING TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────

export interface PaymentTransactionInput {
  paymentDate: Date;
  amountProcessed?: number;
  gstAmountProcessed?: number;
  tdsAmountDeducted?: number;
  paymentReference?: string;
  remarks?: string;
  status?: SubcontractorPaymentStatus;
  /// Which registered company bank account this instalment was paid from
  /// — optional; only synced to a Bank Accounts Payment entry once status
  /// is PAID (a PROCESSED-only instalment hasn't actually moved money yet).
  bankAccountId?: string;
}

function subcontractorPaymentDescription(bill: { invoiceNumber: string; subcontractor: { companyName: string } }): string {
  return `${bill.subcontractor.companyName} – Subcontractor Payment – Invoice No. ${bill.invoiceNumber}`;
}

/// PROCESSED-only instalments haven't actually moved money, so they never
/// reach the bank ledger — only PAID ones do (req. 4.E/F). A status
/// transition away from PAID (edit, or PROCESSED→PAID reversed) voids any
/// existing bank row instead of leaving a stale PAID-only transaction.
async function syncSubcontractorPaymentBankTransaction(
  bill: { projectId: string; invoiceNumber: string; subcontractor: { companyName: string } },
  payment: { id: string; paymentDate: Date; bankAccountId: string | null; status: SubcontractorPaymentStatus; amountProcessed: number; gstAmountProcessed: number; tdsAmountDeducted: number },
  userId: string
) {
  if (payment.status !== 'PAID') {
    await voidAutoTransaction('SUBCONTRACTOR_PAYMENTS', payment.id);
    return;
  }
  await syncAutoTransaction({
    sourceModule: 'SUBCONTRACTOR_PAYMENTS',
    sourceRecordId: payment.id,
    bankAccountId: payment.bankAccountId,
    transactionType: 'PAYMENT',
    transactionDate: payment.paymentDate,
    projectId: bill.projectId,
    description: subcontractorPaymentDescription(bill),
    amount: round2(payment.amountProcessed + payment.gstAmountProcessed),
    userId,
  });
}

async function loadPaymentAndAuthorize(req: Request, paymentId: string) {
  const payment = await prisma.subcontractorPaymentTransaction.findUnique({
    where: { id: paymentId },
    include: { bill: { include: billWithPaymentsInclude } },
  });
  if (!payment) throw ApiError.notFound('Payment processing entry not found');
  assertProjectAccess(req, payment.bill.projectId);
  return payment;
}

async function getBillWithComputed(req: Request, billId: string) {
  const bill = await loadBillAndAuthorize(req, billId);
  return { ...bill, ...computeBillFields(bill) };
}

/// Req. 4.B/"Prevent cumulative payments and deductions from exceeding
/// their respective bill balances": each of the 3 tracked components is
/// capped against its own original bill figure, independent of the other
/// two (amountProcessed vs netPayableAmount, gstAmountProcessed vs
/// gstAmount, tdsAmountDeducted vs tdsAmount) — summed across every
/// transaction regardless of PROCESSED/PAID status, since an in-progress
/// transaction still reserves against the balance. `others` excludes the
/// transaction being added/edited.
function assertWithinBillBalances(
  bill: { netPayableAmount: Prisma.Decimal | number; gstAmount: Prisma.Decimal | number; tdsAmount: Prisma.Decimal | number },
  others: PaymentLike[],
  candidate: { amountProcessed: number; gstAmountProcessed: number; tdsAmountDeducted: number }
) {
  const netPayableAmount = Number(bill.netPayableAmount);
  const gstAmount = Number(bill.gstAmount);
  const tdsAmount = Number(bill.tdsAmount);

  const otherAmount = round2(others.reduce((s, p) => s + Number(p.amountProcessed), 0));
  const otherGst = round2(others.reduce((s, p) => s + Number(p.gstAmountProcessed), 0));
  const otherTds = round2(others.reduce((s, p) => s + Number(p.tdsAmountDeducted), 0));

  const combinedAmount = round2(otherAmount + candidate.amountProcessed);
  const combinedGst = round2(otherGst + candidate.gstAmountProcessed);
  const combinedTds = round2(otherTds + candidate.tdsAmountDeducted);

  if (combinedAmount > netPayableAmount) {
    throw ApiError.badRequest(`Amount Processed (₹${combinedAmount} cumulative) would exceed the bill's Net Payable Amount (₹${netPayableAmount}). At most ₹${Math.max(0, round2(netPayableAmount - otherAmount))} remains available.`);
  }
  if (combinedGst > gstAmount) {
    throw ApiError.badRequest(`GST Amount Processed (₹${combinedGst} cumulative) would exceed the bill's GST Amount (₹${gstAmount}). At most ₹${Math.max(0, round2(gstAmount - otherGst))} remains available.`);
  }
  if (combinedTds > tdsAmount) {
    throw ApiError.badRequest(`TDS Amount Deducted (₹${combinedTds} cumulative) would exceed the bill's TDS Amount (₹${tdsAmount}). At most ₹${Math.max(0, round2(tdsAmount - otherTds))} remains available.`);
  }
}

/// Adds one instalment against a bill — multiple rows accumulate for
/// partial payments (req. 4.A/C), never overwriting previous entries.
export async function addPaymentTransaction(req: Request, billId: string, input: PaymentTransactionInput, meta?: RequestMeta) {
  const bill = await loadBillAndAuthorize(req, billId);
  const amountProcessed = input.amountProcessed ?? 0;
  const gstAmountProcessed = input.gstAmountProcessed ?? 0;
  const tdsAmountDeducted = input.tdsAmountDeducted ?? 0;

  assertWithinBillBalances(bill, bill.payments, { amountProcessed, gstAmountProcessed, tdsAmountDeducted });

  const payment = await prisma.subcontractorPaymentTransaction.create({
    data: {
      billId,
      paymentDate: input.paymentDate,
      amountProcessed,
      gstAmountProcessed,
      tdsAmountDeducted,
      paymentReference: input.paymentReference || null,
      remarks: input.remarks || null,
      status: input.status ?? 'PROCESSED',
      bankAccountId: input.bankAccountId || null,
      createdById: req.user!.sub,
    },
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'SUBCONTRACTORS',
    projectId: bill.projectId,
    status: 'SUCCESS',
    meta,
    details: { billId, paymentId: payment.id, amountProcessed, gstAmountProcessed, tdsAmountDeducted, paymentStatus: payment.status },
  });

  await syncSubcontractorPaymentBankTransaction(bill, { ...payment, amountProcessed, gstAmountProcessed, tdsAmountDeducted }, req.user!.sub);

  return getBillWithComputed(req, billId);
}

export type UpdatePaymentTransactionInput = Partial<PaymentTransactionInput>;

export async function updatePaymentTransaction(req: Request, paymentId: string, input: UpdatePaymentTransactionInput, meta?: RequestMeta) {
  const existing = await loadPaymentAndAuthorize(req, paymentId);

  const amountProcessed = input.amountProcessed ?? Number(existing.amountProcessed);
  const gstAmountProcessed = input.gstAmountProcessed ?? Number(existing.gstAmountProcessed);
  const tdsAmountDeducted = input.tdsAmountDeducted ?? Number(existing.tdsAmountDeducted);

  const others = existing.bill.payments.filter((p) => p.id !== paymentId);
  assertWithinBillBalances(existing.bill, others, { amountProcessed, gstAmountProcessed, tdsAmountDeducted });

  const payment = await prisma.subcontractorPaymentTransaction.update({
    where: { id: paymentId },
    data: {
      paymentDate: input.paymentDate ?? undefined,
      amountProcessed: input.amountProcessed ?? undefined,
      gstAmountProcessed: input.gstAmountProcessed ?? undefined,
      tdsAmountDeducted: input.tdsAmountDeducted ?? undefined,
      paymentReference: input.paymentReference !== undefined ? input.paymentReference || null : undefined,
      remarks: input.remarks !== undefined ? input.remarks || null : undefined,
      status: input.status ?? undefined,
      bankAccountId: input.bankAccountId !== undefined ? input.bankAccountId || null : undefined,
      updatedById: req.user!.sub,
    },
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'SUBCONTRACTORS',
    projectId: existing.bill.projectId,
    status: 'SUCCESS',
    meta,
    details: { billId: existing.billId, paymentId, changes: input, oldStatus: existing.status, newStatus: payment.status },
  });

  await syncSubcontractorPaymentBankTransaction(
    existing.bill,
    { ...payment, amountProcessed, gstAmountProcessed, tdsAmountDeducted },
    req.user!.sub
  );

  return getBillWithComputed(req, existing.billId);
}

export async function deletePaymentTransaction(req: Request, paymentId: string, meta?: RequestMeta) {
  const existing = await loadPaymentAndAuthorize(req, paymentId);

  await prisma.subcontractorPaymentTransaction.delete({ where: { id: paymentId } });
  await voidAutoTransaction('SUBCONTRACTOR_PAYMENTS', paymentId);

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'SUBCONTRACTORS',
    projectId: existing.bill.projectId,
    status: 'SUCCESS',
    meta,
    details: { billId: existing.billId, paymentId, amountProcessed: Number(existing.amountProcessed) },
  });

  return getBillWithComputed(req, existing.billId);
}

// ─────────────────────────────────────────────────────────────────────────
// SUBCONTRACTOR PAYMENT DUE DASHBOARD
// ─────────────────────────────────────────────────────────────────────────

export interface PaymentDueFilters {
  projectId?: string;
  subcontractorId?: string;
  billingMonth?: number;
  billingYear?: number;
}

/// Req. #5: invoices that have crossed 30 days from their invoice date and
/// still carry an outstanding balance (Paid-only payments count toward
/// settling it — a Processed-but-not-Paid instalment never counts as
/// settled). Sorted oldest due date first; fully paid invoices drop off
/// automatically since nothing here is pre-computed/stored.
export async function getSubcontractorPaymentDue(req: Request, filters: PaymentDueFilters, pagination: PaginationParams) {
  const where: Prisma.SubcontractorBillWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.subcontractorId ? { subcontractorId: filters.subcontractorId } : {}),
    ...(filters.billingMonth ? { billingMonth: filters.billingMonth } : {}),
    ...(filters.billingYear ? { billingYear: filters.billingYear } : {}),
  };

  const bills = await prisma.subcontractorBill.findMany({ where, include: billWithPaymentsInclude });
  const due = bills
    .map((b) => ({ ...b, ...computeBillFields(b) }))
    .filter((b) => b.isOverdue)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const total = due.length;
  const totalOutstanding = round2(due.reduce((sum, b) => sum + b.outstandingAmount, 0));
  const rows = due.slice(pagination.skip, pagination.skip + pagination.take);

  return { rows, total, totalOutstanding };
}
