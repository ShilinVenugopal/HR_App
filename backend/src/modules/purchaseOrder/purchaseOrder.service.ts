import { Prisma, POStatus, Role } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';
import { listEligibleApprovers } from '../../utils/approvers';
import { createNotification } from '../notifications/notifications.service';

const includeRelations = {
  project: { select: { id: true, projectName: true, projectNumber: true } },
  vendor: true,
  pr: { select: { id: true, requestNumber: true, prNumber: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  items: { include: { costCode: { select: { id: true, code: true, name: true } } }, orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.PurchaseOrderInclude;

/// A PO can only be edited/submitted while Draft — unlike PR there is no
/// Returned state for PO in the design brief's workflow (PO Creator ->
/// Authorized Approver -> Approved -> Locked), so Rejected is the only
/// other terminal-but-editable-never-again state, same treatment as PR's
/// Rejected.
const EDITABLE_STATUSES: POStatus[] = ['DRAFT'];

export interface PoItemInput {
  costCodeId?: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  gstPercent?: number;
  remarks?: string;
}

export interface PoFilters {
  projectId?: string;
  vendorId?: string;
  status?: string;
  month?: number;
  year?: number;
}

export async function listPurchaseOrders(req: Request, pagination: PaginationParams, filters: PoFilters) {
  const where: Prisma.PurchaseOrderWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
    ...(filters.status ? { status: filters.status as POStatus } : {}),
    ...(filters.month || filters.year
      ? {
          poDate: {
            ...(filters.year && filters.month ? { gte: new Date(filters.year, filters.month - 1, 1), lt: new Date(filters.year, filters.month, 1) } : {}),
            ...(filters.year && !filters.month ? { gte: new Date(filters.year, 0, 1), lt: new Date(filters.year + 1, 0, 1) } : {}),
          },
        }
      : {}),
    ...(pagination.search ? { poNumber: { contains: pagination.search, mode: 'insensitive' } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: includeRelations,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'createdAt']: pagination.sortOrder },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return { rows, total };
}

async function loadAndAuthorize(req: Request, id: string) {
  const record = await prisma.purchaseOrder.findUnique({ where: { id }, include: includeRelations });
  if (!record) throw ApiError.notFound('Purchase Order not found');
  assertProjectAccess(req, record.projectId);
  return record;
}

export async function getPurchaseOrder(req: Request, id: string) {
  const po = await loadAndAuthorize(req, id);
  const approvalHistory = await prisma.approval.findMany({
    where: { documentType: 'PO', documentId: id },
    include: { actedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return { ...po, approvalHistory };
}

/// amount/gstAmount/extendedPrice are always server-computed from
/// qty/rate/gstPercent — never trust a client-submitted total, same rule
/// the Wages formula engine and PR's balQtyReq follow.
function computeItemData(item: PoItemInput, sortOrder: number) {
  const amount = round2(item.qty * item.rate);
  const gstPercent = item.gstPercent ?? 0;
  const gstAmount = round2((amount * gstPercent) / 100);
  const extendedPrice = round2(amount + gstAmount);
  return {
    costCodeId: item.costCodeId || null,
    description: item.description,
    unit: item.unit as Prisma.PurchaseOrderItemUncheckedCreateInput['unit'],
    qty: item.qty,
    rate: item.rate,
    amount,
    gstPercent,
    gstAmount,
    extendedPrice,
    remarks: item.remarks || null,
    sortOrder,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeTotals(items: ReturnType<typeof computeItemData>[], packingForwarding: number, transportationCharges: number, taxesAndDuties: number) {
  const subtotal = round2(items.reduce((sum, it) => sum + it.extendedPrice, 0));
  const grandTotal = round2(subtotal + packingForwarding + transportationCharges + taxesAndDuties);
  return { subtotal, grandTotal };
}

export interface CreatePoInput {
  projectId: string;
  prId?: string;
  poNumber: string;
  poDate?: Date;
  vendorId: string;
  enquiryNoDate?: string;
  quotationNo?: string;
  ref?: string;
  jobNo?: string;
  deliveryDate?: Date;
  packingForwarding?: number;
  transportationCharges?: number;
  taxesAndDuties?: number;
  items: PoItemInput[];
}

export async function createPurchaseOrder(req: Request, input: CreatePoInput, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);

  const existing = await prisma.purchaseOrder.findUnique({ where: { projectId_poNumber: { projectId: input.projectId, poNumber: input.poNumber } } });
  if (existing) throw ApiError.conflict(`PO Number "${input.poNumber}" already exists for this project`);

  if (input.prId) {
    const pr = await prisma.purchaseRequisition.findUnique({ where: { id: input.prId } });
    if (!pr) throw ApiError.badRequest('Source Purchase Requisition not found');
    if (pr.projectId !== input.projectId) throw ApiError.badRequest('Source Purchase Requisition belongs to a different project');
  }

  const itemsData = input.items.map((it, idx) => computeItemData(it, idx));
  const { subtotal, grandTotal } = computeTotals(itemsData, input.packingForwarding ?? 0, input.transportationCharges ?? 0, input.taxesAndDuties ?? 0);

  // Snapshot the *current* default Terms & Conditions template into this
  // PO at creation time — editing the template later only changes what
  // future POs get; this PO keeps exactly what it was created with.
  const currentTerms = await prisma.purchaseOrderTerm.findMany({ orderBy: { sortOrder: 'asc' } });
  const termsSnapshot = currentTerms.map((t) => ({ id: t.id, heading: t.heading, body: t.body }));

  const po = await prisma.purchaseOrder.create({
    data: {
      projectId: input.projectId,
      prId: input.prId || null,
      poNumber: input.poNumber,
      poDate: input.poDate ?? new Date(),
      vendorId: input.vendorId,
      enquiryNoDate: input.enquiryNoDate || null,
      quotationNo: input.quotationNo || null,
      ref: input.ref || null,
      jobNo: input.jobNo || null,
      deliveryDate: input.deliveryDate || null,
      packingForwarding: input.packingForwarding ?? 0,
      transportationCharges: input.transportationCharges ?? 0,
      taxesAndDuties: input.taxesAndDuties ?? 0,
      subtotal,
      grandTotal,
      status: 'DRAFT',
      createdById: req.user!.sub,
      termsAndConditions: termsSnapshot,
      items: { create: itemsData },
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'PURCHASE_ORDER',
    projectId: po.projectId,
    status: 'SUCCESS',
    meta,
    details: { poId: po.id, poNumber: po.poNumber },
  });

  return po;
}

export type UpdatePoInput = Partial<Omit<CreatePoInput, 'projectId'>>;

export async function updatePurchaseOrder(req: Request, id: string, input: UpdatePoInput, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw ApiError.badRequest(`This Purchase Order is ${existing.status.toLowerCase()} and cannot be edited`);
  }

  if (input.poNumber && input.poNumber !== existing.poNumber) {
    const dup = await prisma.purchaseOrder.findUnique({ where: { projectId_poNumber: { projectId: existing.projectId, poNumber: input.poNumber } } });
    if (dup) throw ApiError.conflict(`PO Number "${input.poNumber}" already exists for this project`);
  }

  const itemsData = input.items ? input.items.map((it, idx) => computeItemData(it, idx)) : null;
  const packingForwarding = input.packingForwarding ?? Number(existing.packingForwarding);
  const transportationCharges = input.transportationCharges ?? Number(existing.transportationCharges);
  const taxesAndDuties = input.taxesAndDuties ?? Number(existing.taxesAndDuties);

  const currentItemTotals = itemsData ?? existing.items.map((it) => ({ extendedPrice: Number(it.extendedPrice) }));
  const { subtotal, grandTotal } = computeTotals(currentItemTotals as ReturnType<typeof computeItemData>[], packingForwarding, transportationCharges, taxesAndDuties);

  const po = await prisma.$transaction(async (tx) => {
    if (itemsData) {
      await tx.purchaseOrderItem.deleteMany({ where: { poId: id } });
    }
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        poNumber: input.poNumber,
        poDate: input.poDate,
        vendorId: input.vendorId,
        enquiryNoDate: input.enquiryNoDate !== undefined ? input.enquiryNoDate || null : undefined,
        quotationNo: input.quotationNo !== undefined ? input.quotationNo || null : undefined,
        ref: input.ref !== undefined ? input.ref || null : undefined,
        jobNo: input.jobNo !== undefined ? input.jobNo || null : undefined,
        deliveryDate: input.deliveryDate !== undefined ? input.deliveryDate || null : undefined,
        packingForwarding,
        transportationCharges,
        taxesAndDuties,
        subtotal,
        grandTotal,
        items: itemsData ? { create: itemsData } : undefined,
      },
      include: includeRelations,
    });
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'PURCHASE_ORDER',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { poId: id },
  });

  return po;
}

/// Regular users (whoever holds the PURCHASE_ORDER 'delete' permission)
/// may only ever remove their own Draft POs — unchanged from before.
/// Super Admin additionally gets a permanent-delete power that works on a
/// PO in any status, including Approved — same endpoint, same permission
/// gate, just an extra bypass on the status check below.
///
/// The GRN check is NOT bypassed for Super Admin: a Goods Received Note
/// is a real receipt event, and "Update Inventory" against a GRN may
/// already have credited live stock quantities — permanently deleting the
/// PO out from under that would leave inventory numbers with no
/// underlying paper trail. Matches the existing Vendor/CostCode
/// delete-blocked-by-dependents precedent elsewhere in this codebase.
export async function deletePurchaseOrder(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  const isSuperAdmin = req.user!.role === Role.SUPER_ADMIN;
  if (!isSuperAdmin && existing.status !== 'DRAFT') {
    throw ApiError.badRequest('Only Draft Purchase Orders can be deleted');
  }

  const grnCount = await prisma.goodsReceivedNote.count({ where: { poId: id } });
  if (grnCount > 0) {
    throw ApiError.conflict(
      'This Purchase Order has Goods Received Notes recorded against it and cannot be deleted — that receipt history (and any inventory already updated from it) must be preserved.'
    );
  }

  await prisma.$transaction([
    // Approval/Attachment are intentionally polymorphic (not typed Prisma
    // relations), so nothing FK-cascades them; clean them up explicitly
    // to avoid leaving orphan rows.
    prisma.attachment.deleteMany({ where: { ownerType: 'PO', ownerId: id } }),
    prisma.approval.deleteMany({ where: { documentType: 'PO', documentId: id } }),
    // PurchaseOrderItem cascades automatically (onDelete: Cascade).
    prisma.purchaseOrder.delete({ where: { id } }),
  ]);

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'PURCHASE_ORDER',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { poId: id, poNumber: existing.poNumber, permanentDelete: existing.status !== 'DRAFT' },
  });
}

export async function listApprovers(req: Request, projectId: string) {
  assertProjectAccess(req, projectId);
  return listEligibleApprovers(projectId, 'PURCHASE_ORDER');
}

export async function submitPurchaseOrder(req: Request, id: string, approverId: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw ApiError.badRequest(`This Purchase Order is ${existing.status.toLowerCase()} and cannot be submitted`);
  }
  if (!existing.items.length) {
    throw ApiError.badRequest('Add at least one item before submitting for approval');
  }

  const eligible = await listEligibleApprovers(existing.projectId, 'PURCHASE_ORDER');
  if (!eligible.some((u) => u.id === approverId)) {
    throw ApiError.badRequest('Selected approver is not eligible for this project');
  }

  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'PENDING_APPROVAL' },
    include: includeRelations,
  });

  await prisma.approval.create({
    data: { documentType: 'PO', documentId: id, action: 'SUBMIT', actedById: req.user!.sub, comments: null },
  });

  await createNotification({
    userId: approverId,
    type: 'PO_PENDING',
    title: 'Purchase Order pending your approval',
    message: `PO ${po.poNumber} is waiting for your approval.`,
    documentType: 'PO',
    documentId: id,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'PURCHASE_ORDER',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { poId: id, submitted: true, approverId },
  });

  return po;
}

// PO has no per-document currentApproverId field (unlike PR, which pins a
// specific "Requester selects approver"). Any user holding
// PURCHASE_ORDER.canApprove for the project — enforced by the route's
// requirePermission plus loadAndAuthorize's assertProjectAccess above —
// may decide, or Super Admin.
export async function decidePurchaseOrder(req: Request, id: string, action: 'APPROVE' | 'REJECT', comments: string | undefined, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status !== 'PENDING_APPROVAL') {
    throw ApiError.badRequest('This Purchase Order is not pending approval');
  }

  const nextStatus: POStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: nextStatus,
      approvedById: action === 'APPROVE' ? req.user!.sub : existing.approvedById,
      approvedAt: action === 'APPROVE' ? new Date() : existing.approvedAt,
    },
    include: includeRelations,
  });

  await prisma.approval.create({
    data: { documentType: 'PO', documentId: id, action, actedById: req.user!.sub, comments: comments || null },
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'APPROVE',
    module: 'PURCHASE_ORDER',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { poId: id, decision: action, comments },
  });

  if (action === 'APPROVE' && existing.prId) {
    const pr = await prisma.purchaseRequisition.findUnique({ where: { id: existing.prId }, select: { requesterId: true, requestNumber: true } });
    if (pr) {
      await createNotification({
        userId: pr.requesterId,
        type: 'PO_APPROVED',
        title: 'Purchase Order Approved',
        message: `PO ${po.poNumber} (from your requisition ${pr.requestNumber}) has been approved.`,
        documentType: 'PO',
        documentId: id,
      });
    }
  } else if (action === 'APPROVE') {
    // Not sourced from a PR (a direct/walk-in PO) — the creator is the only
    // interested party to notify.
    await createNotification({
      userId: existing.createdById,
      type: 'PO_APPROVED',
      title: 'Purchase Order Approved',
      message: `PO ${po.poNumber} has been approved.`,
      documentType: 'PO',
      documentId: id,
    });
  } else {
    await createNotification({
      userId: existing.createdById,
      type: 'PO_REJECTED',
      title: 'Purchase Order Rejected',
      message: `PO ${po.poNumber} has been rejected.`,
      documentType: 'PO',
      documentId: id,
    });
  }

  return po;
}

/// Route-gated to Super Admin only. Resets to Draft so the creator can
/// edit and resubmit.
export async function unlockPurchaseOrder(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status !== 'APPROVED') {
    throw ApiError.badRequest('Only Approved Purchase Orders can be unlocked');
  }

  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'DRAFT', approvedById: null, approvedAt: null },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'PURCHASE_ORDER',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { poId: id, unlocked: true },
  });

  return po;
}

export interface PoSettingsInput {
  billingAddress?: string;
  billingGstNumber?: string;
  signatureImageUrl?: string;
  authorizedName?: string;
  authorizedDesignation?: string;
}

/// The "static yellow fields" — gated to Super Admin at the route level.
/// A blank string is normalized to null so the printed/exported view falls
/// back to the default text (Forays' own billing address, "—" for
/// authorized name, etc.) instead of persisting an empty override that
/// then displays as literally blank.
export async function updatePurchaseOrderSettings(req: Request, id: string, input: PoSettingsInput, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);

  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      billingAddress: input.billingAddress !== undefined ? input.billingAddress || null : undefined,
      billingGstNumber: input.billingGstNumber !== undefined ? input.billingGstNumber || null : undefined,
      signatureImageUrl: input.signatureImageUrl !== undefined ? input.signatureImageUrl || null : undefined,
      authorizedName: input.authorizedName !== undefined ? input.authorizedName || null : undefined,
      authorizedDesignation: input.authorizedDesignation !== undefined ? input.authorizedDesignation || null : undefined,
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'PURCHASE_ORDER',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { poId: id, settingsChanged: true },
  });

  return po;
}
