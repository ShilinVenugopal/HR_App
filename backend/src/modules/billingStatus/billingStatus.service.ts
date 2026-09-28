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

const paymentInclude = {
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.BillingPaymentInclude;

const itemInclude = {
  billingRecord: { include: recordInclude },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  payments: { include: paymentInclude, orderBy: { paymentDate: 'asc' as const } },
} satisfies Prisma.BillingItemInclude;

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

export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'FULLY_PAID' | 'OVERPAID';
export type NotificationStatus = 'NOT_DUE' | 'DUE' | 'OVERDUE' | 'FULLY_PAID' | null;

export interface ComputedBillingFields {
  totalReceived: number;
  outstandingAmount: number;
  paymentStatus: PaymentStatus;
  dueDate: Date | null;
  notificationStatus: NotificationStatus;
}

/// Outstanding/received/status/dueDate are always derived here from
/// totalAmount + the payment rows + the current notification settings —
/// never stored — so they can never drift out of sync with their inputs
/// (req. #8), and changing the Super Admin's dueDays setting instantly
/// "recalculates" every invoice's due date on the next read (req. #6).
function computeBillingFields(
  item: { invoiceDate: Date | null; totalAmount: Prisma.Decimal | number; payments: { amountReceived: Prisma.Decimal | number }[] },
  dueDays: number
): ComputedBillingFields {
  const totalAmount = Number(item.totalAmount);
  const totalReceived = round2(item.payments.reduce((sum, p) => sum + Number(p.amountReceived), 0));
  const outstandingAmount = round2(totalAmount - totalReceived);

  let paymentStatus: PaymentStatus;
  if (totalReceived > totalAmount) paymentStatus = 'OVERPAID';
  else if (totalAmount > 0 && totalReceived === totalAmount) paymentStatus = 'FULLY_PAID';
  else if (totalReceived > 0) paymentStatus = 'PARTIALLY_PAID';
  else paymentStatus = 'UNPAID';

  const dueDate = item.invoiceDate ? addDays(item.invoiceDate, dueDays) : null;

  let notificationStatus: NotificationStatus = null;
  if (dueDate) {
    if (paymentStatus === 'FULLY_PAID' || paymentStatus === 'OVERPAID') {
      notificationStatus = 'FULLY_PAID';
    } else {
      const today = startOfDay(new Date()).getTime();
      const due = startOfDay(dueDate).getTime();
      notificationStatus = today < due ? 'NOT_DUE' : today === due ? 'DUE' : 'OVERDUE';
    }
  }

  return { totalReceived, outstandingAmount, paymentStatus, dueDate, notificationStatus };
}

/// Lazily creates the single settings row on first read — avoids needing a
/// seed-time migration step for a brand-new, always-one-row config table.
async function getOrCreateSettings() {
  const existing = await prisma.billingNotificationSettings.findFirst();
  if (existing) return existing;
  return prisma.billingNotificationSettings.create({ data: {} });
}

export interface BillingItemInput {
  plantUnit: string;
  invoiceNo?: string;
  jmsNo?: string;
  invoiceDate: Date;
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
    invoiceDate: item.invoiceDate,
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
  const [items, settings] = await Promise.all([
    prisma.billingItem.findMany({
      where: { billingRecordId: id },
      include: {
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
        payments: { include: paymentInclude, orderBy: { paymentDate: 'asc' } },
      },
      orderBy: { srNo: 'asc' },
    }),
    getOrCreateSettings(),
  ]);
  const enrichedItems = items.map((it) => ({ ...it, ...computeBillingFields(it, settings.dueDays) }));
  return { ...record, items: enrichedItems };
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

  const [rows, total, settings] = await Promise.all([
    prisma.billingItem.findMany({
      where,
      include: itemInclude,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [sortBy]: pagination.sortOrder },
    }),
    prisma.billingItem.count({ where }),
    getOrCreateSettings(),
  ]);

  const enrichedRows = rows.map((r) => ({ ...r, ...computeBillingFields(r, settings.dueDays) }));

  return { rows: enrichedRows, total };
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
  invoiceDate?: Date;
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
      invoiceDate: input.invoiceDate ?? undefined,
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

  const settings = await getOrCreateSettings();
  return { ...item, ...computeBillingFields(item, settings.dueDays) };
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

// ─────────────────────────────────────────────────────────────────────────
// PAYMENTS (Amount Received / partial-payment history)
// ─────────────────────────────────────────────────────────────────────────

export interface BillingPaymentInput {
  amountReceived: number;
  paymentDate: Date;
  remarks?: string;
}

async function loadPaymentAndAuthorize(req: Request, paymentId: string) {
  const payment = await prisma.billingPayment.findUnique({
    where: { id: paymentId },
    include: { billingItem: { include: itemInclude } },
  });
  if (!payment) throw ApiError.notFound('Payment not found');
  assertProjectAccess(req, payment.billingItem.billingRecord.projectId);
  return payment;
}

async function getBillingItemWithComputed(req: Request, itemId: string) {
  const [item, settings] = await Promise.all([loadItemAndAuthorize(req, itemId), getOrCreateSettings()]);
  return { ...item, ...computeBillingFields(item, settings.dueDays) };
}

/// Adds one payment row against an invoice — multiple rows accumulate for
/// partial payments (req. #2); amountReceived/outstandingAmount are never
/// stored, only ever derived by computeBillingFields, so they recompute
/// automatically on every read. Guards against an accidental double-submit
/// recording the same payment twice by rejecting an exact amount+date
/// duplicate against the same invoice.
export async function addBillingPayment(req: Request, itemId: string, input: BillingPaymentInput, meta?: RequestMeta) {
  const item = await loadItemAndAuthorize(req, itemId);

  const duplicate = await prisma.billingPayment.findFirst({
    where: { billingItemId: itemId, amountReceived: input.amountReceived, paymentDate: input.paymentDate },
  });
  if (duplicate) {
    throw ApiError.conflict('A payment with this exact amount and date has already been recorded against this invoice');
  }

  const payment = await prisma.billingPayment.create({
    data: {
      billingItemId: itemId,
      amountReceived: input.amountReceived,
      paymentDate: input.paymentDate,
      remarks: input.remarks || null,
      createdById: req.user!.sub,
    },
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'BILLING_STATUS',
    projectId: item.billingRecord.projectId,
    status: 'SUCCESS',
    meta,
    details: { billingItemId: itemId, paymentId: payment.id, amountReceived: input.amountReceived, paymentDate: input.paymentDate },
  });

  return getBillingItemWithComputed(req, itemId);
}

export type UpdateBillingPaymentInput = Partial<BillingPaymentInput>;

/// Editing a payment recalculates the invoice's outstanding amount and
/// status for free, since both are derived at read time rather than stored
/// (req. #2, #7).
export async function updateBillingPayment(req: Request, paymentId: string, input: UpdateBillingPaymentInput, meta?: RequestMeta) {
  const existing = await loadPaymentAndAuthorize(req, paymentId);

  const payment = await prisma.billingPayment.update({
    where: { id: paymentId },
    data: {
      amountReceived: input.amountReceived ?? undefined,
      paymentDate: input.paymentDate ?? undefined,
      remarks: input.remarks !== undefined ? input.remarks || null : undefined,
      updatedById: req.user!.sub,
    },
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'BILLING_STATUS',
    projectId: existing.billingItem.billingRecord.projectId,
    status: 'SUCCESS',
    meta,
    details: {
      billingItemId: existing.billingItemId,
      paymentId,
      oldAmountReceived: Number(existing.amountReceived),
      newAmountReceived: Number(payment.amountReceived),
      oldPaymentDate: existing.paymentDate,
      newPaymentDate: payment.paymentDate,
    },
  });

  return getBillingItemWithComputed(req, existing.billingItemId);
}

/// Hard delete, same convention as every other delete in this module — the
/// AuditLog entry written here (amount/date/who/when) is what preserves the
/// payment's history afterward, per req. #7's "wherever the existing
/// architecture supports audit records."
export async function deleteBillingPayment(req: Request, paymentId: string, meta?: RequestMeta) {
  const existing = await loadPaymentAndAuthorize(req, paymentId);

  await prisma.billingPayment.delete({ where: { id: paymentId } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'BILLING_STATUS',
    projectId: existing.billingItem.billingRecord.projectId,
    status: 'SUCCESS',
    meta,
    details: { billingItemId: existing.billingItemId, paymentId, amountReceived: Number(existing.amountReceived), paymentDate: existing.paymentDate },
  });

  return getBillingItemWithComputed(req, existing.billingItemId);
}

// ─────────────────────────────────────────────────────────────────────────
// PAYMENT DUE NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────

export interface PaymentDueFilters {
  projectId?: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
}

/// Invoices that have reached their payment due date and still carry an
/// outstanding balance (req. #4, #5, #9). Fully paid invoices, invoices
/// with no invoice date (can't compute a due date), and invoices not yet
/// due are never included. Disabled entirely (but never deleting any
/// invoice/payment data) when the Super Admin turns notifications off.
export async function getPaymentDueNotifications(req: Request, filters: PaymentDueFilters) {
  const settings = await getOrCreateSettings();
  if (!settings.enabled) {
    return { rows: [], settings };
  }

  const where: Prisma.BillingItemWhereInput = {
    billingRecord: {
      ...projectScopeWhere(req),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
    },
    invoiceDate: { not: null },
  };

  const items = await prisma.billingItem.findMany({
    where,
    include: itemInclude,
    orderBy: { invoiceDate: 'asc' },
  });

  const rows = items
    .map((it) => ({ ...it, ...computeBillingFields(it, settings.dueDays) }))
    .filter((it) => {
      if (it.notificationStatus !== 'DUE' && it.notificationStatus !== 'OVERDUE') return false;
      if (it.outstandingAmount <= 0) return false;
      // 'OVERDUE' takes priority over the underlying UNPAID/PARTIALLY_PAID
      // label for filtering purposes — matches the Super Admin's "unpaid /
      // partially paid / overdue" configuration options (req. #6).
      const displayStatus = it.notificationStatus === 'OVERDUE' ? 'OVERDUE' : it.paymentStatus;
      if (!settings.visibleStatuses.includes(displayStatus)) return false;
      if (filters.dueDateFrom && (!it.dueDate || it.dueDate < filters.dueDateFrom)) return false;
      if (filters.dueDateTo && (!it.dueDate || it.dueDate > filters.dueDateTo)) return false;
      return true;
    });

  return { rows, settings };
}

// ─────────────────────────────────────────────────────────────────────────
// SUPER ADMIN NOTIFICATION SETTINGS
// ─────────────────────────────────────────────────────────────────────────

export async function getNotificationSettings() {
  return getOrCreateSettings();
}

export interface NotificationSettingsInput {
  enabled?: boolean;
  dueDays?: number;
  visibleStatuses?: string[];
  visibleFields?: string[];
}

/// Route-gated to Super Admin only (requireSuperAdmin) — enforced in the
/// backend, not just hidden in the UI, per req. #6's "Enforce these
/// permissions in the backend as well as the frontend." Never touches any
/// BillingItem/BillingPayment row — only this one settings row — so
/// applying a new period or visibility rule can never affect existing
/// invoice or payment data (req. #6, #8).
export async function updateNotificationSettings(req: Request, input: NotificationSettingsInput, meta?: RequestMeta) {
  const existing = await getOrCreateSettings();

  const settings = await prisma.billingNotificationSettings.update({
    where: { id: existing.id },
    data: {
      enabled: input.enabled ?? undefined,
      dueDays: input.dueDays ?? undefined,
      visibleStatuses: input.visibleStatuses ?? undefined,
      visibleFields: input.visibleFields ?? undefined,
      updatedById: req.user!.sub,
    },
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'BILLING_STATUS',
    status: 'SUCCESS',
    meta,
    details: { settingsId: settings.id, changes: input },
  });

  return settings;
}
