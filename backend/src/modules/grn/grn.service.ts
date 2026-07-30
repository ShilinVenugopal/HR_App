import { Prisma, GRNStatus } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';
import { nextDocumentNumber } from '../../utils/documentSequence';
import { listEligibleApprovers } from '../../utils/approvers';
import { createNotification } from '../notifications/notifications.service';

const includeRelations = {
  project: { select: { id: true, projectName: true, projectNumber: true } },
  po: { select: { id: true, poNumber: true, poDate: true, vendor: { select: { id: true, name: true } } } },
  submittedBy: { select: { id: true, name: true, email: true } },
  currentApprover: { select: { id: true, name: true, email: true } },
  inventoryUpdatedBy: { select: { id: true, name: true } },
  items: { include: { costCode: { select: { id: true, code: true, name: true } } }, orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.GoodsReceivedNoteInclude;

/// Same locked-document rule as PR/PO: a GRN can only be edited while
/// Draft or Returned; Pending/Approved/Rejected are locked.
const EDITABLE_STATUSES: GRNStatus[] = ['DRAFT', 'RETURNED'];

export interface GrnItemInput {
  costCodeId?: string;
  description: string;
  unit: string;
  qtyAsPerChallan: number;
  actualQtyReceived: number;
  acceptedQty: number;
  remarks?: string;
}

export interface GrnFilters {
  projectId?: string;
  poId?: string;
  status?: string;
}

export async function listGoodsReceivedNotes(req: Request, pagination: PaginationParams, filters: GrnFilters) {
  const where: Prisma.GoodsReceivedNoteWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.poId ? { poId: filters.poId } : {}),
    ...(filters.status ? { status: filters.status as GRNStatus } : {}),
    ...(pagination.search ? { grnNumber: { contains: pagination.search, mode: 'insensitive' } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.goodsReceivedNote.findMany({
      where,
      include: includeRelations,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'createdAt']: pagination.sortOrder },
    }),
    prisma.goodsReceivedNote.count({ where }),
  ]);

  return { rows, total };
}

async function loadAndAuthorize(req: Request, id: string) {
  const record = await prisma.goodsReceivedNote.findUnique({ where: { id }, include: includeRelations });
  if (!record) throw ApiError.notFound('Goods Received Note not found');
  assertProjectAccess(req, record.projectId);
  return record;
}

export async function getGoodsReceivedNote(req: Request, id: string) {
  const grn = await loadAndAuthorize(req, id);
  const approvalHistory = await prisma.approval.findMany({
    where: { documentType: 'GRN', documentId: id },
    include: { actedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return { ...grn, approvalHistory };
}

/// rejectedQty is always server-computed as actualQtyReceived minus
/// acceptedQty — never trust a client-submitted rejected figure, same rule
/// PR's balQtyReq and PO's amount/gstAmount follow.
function computeItemData(item: GrnItemInput, sortOrder: number) {
  const rejectedQty = Math.max(0, item.actualQtyReceived - item.acceptedQty);
  return {
    costCodeId: item.costCodeId || null,
    description: item.description,
    unit: item.unit as Prisma.GoodsReceivedNoteItemUncheckedCreateInput['unit'],
    qtyAsPerChallan: item.qtyAsPerChallan,
    actualQtyReceived: item.actualQtyReceived,
    acceptedQty: item.acceptedQty,
    rejectedQty,
    remarks: item.remarks || null,
    sortOrder,
  };
}

export interface CreateGrnInput {
  projectId: string;
  poId: string;
  supplierName?: string;
  receiptDate?: Date;
  challanNumber?: string;
  challanDate?: Date;
  lrNumber?: string;
  lrDate?: Date;
  transporterName?: string;
  items: GrnItemInput[];
}

async function assertPoReadyForGrn(projectId: string, poId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) throw ApiError.badRequest('Purchase Order not found');
  if (po.projectId !== projectId) throw ApiError.badRequest('Purchase Order belongs to a different project');
  if (po.status !== 'APPROVED') throw ApiError.badRequest('A Goods Received Note can only be created against an Approved Purchase Order');
  return po;
}

export async function createGoodsReceivedNote(req: Request, input: CreateGrnInput, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);
  await assertPoReadyForGrn(input.projectId, input.poId);

  const grnNumber = await nextDocumentNumber(input.projectId, 'GRN');

  const grn = await prisma.goodsReceivedNote.create({
    data: {
      projectId: input.projectId,
      poId: input.poId,
      grnNumber,
      grnDate: new Date(),
      supplierName: input.supplierName || null,
      receiptDate: input.receiptDate || null,
      challanNumber: input.challanNumber || null,
      challanDate: input.challanDate || null,
      lrNumber: input.lrNumber || null,
      lrDate: input.lrDate || null,
      transporterName: input.transporterName || null,
      status: 'DRAFT',
      items: { create: input.items.map((it, idx) => computeItemData(it, idx)) },
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'GRN',
    projectId: grn.projectId,
    status: 'SUCCESS',
    meta,
    details: { grnId: grn.id, grnNumber: grn.grnNumber },
  });

  return grn;
}

export type UpdateGrnInput = Partial<Omit<CreateGrnInput, 'projectId' | 'poId'>>;

export async function updateGoodsReceivedNote(req: Request, id: string, input: UpdateGrnInput, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw ApiError.badRequest(`This Goods Received Note is ${existing.status.toLowerCase()} and cannot be edited`);
  }

  const grn = await prisma.$transaction(async (tx) => {
    if (input.items) {
      await tx.goodsReceivedNoteItem.deleteMany({ where: { grnId: id } });
    }
    return tx.goodsReceivedNote.update({
      where: { id },
      data: {
        supplierName: input.supplierName !== undefined ? input.supplierName || null : undefined,
        receiptDate: input.receiptDate !== undefined ? input.receiptDate || null : undefined,
        challanNumber: input.challanNumber !== undefined ? input.challanNumber || null : undefined,
        challanDate: input.challanDate !== undefined ? input.challanDate || null : undefined,
        lrNumber: input.lrNumber !== undefined ? input.lrNumber || null : undefined,
        lrDate: input.lrDate !== undefined ? input.lrDate || null : undefined,
        transporterName: input.transporterName !== undefined ? input.transporterName || null : undefined,
        // A Returned GRN being fixed goes back to Draft — resubmission is a
        // separate, explicit action (the submit endpoint below).
        status: existing.status === 'RETURNED' ? 'DRAFT' : existing.status,
        items: input.items ? { create: input.items.map((it, idx) => computeItemData(it, idx)) } : undefined,
      },
      include: includeRelations,
    });
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'GRN',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { grnId: id },
  });

  return grn;
}

export async function deleteGoodsReceivedNote(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status !== 'DRAFT') {
    throw ApiError.badRequest('Only Draft Goods Received Notes can be deleted');
  }

  await prisma.goodsReceivedNote.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'GRN',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { grnId: id },
  });
}

export async function listApprovers(req: Request, projectId: string) {
  assertProjectAccess(req, projectId);
  return listEligibleApprovers(projectId, 'GRN');
}

export async function submitGoodsReceivedNote(req: Request, id: string, approverId: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw ApiError.badRequest(`This Goods Received Note is ${existing.status.toLowerCase()} and cannot be submitted`);
  }
  if (!existing.items.length) {
    throw ApiError.badRequest('Add at least one item before submitting for approval');
  }

  const eligible = await listEligibleApprovers(existing.projectId, 'GRN');
  if (!eligible.some((u) => u.id === approverId)) {
    throw ApiError.badRequest('Selected approver is not eligible for this project');
  }

  const grn = await prisma.goodsReceivedNote.update({
    where: { id },
    data: { status: 'PENDING_APPROVAL', submittedById: req.user!.sub, currentApproverId: approverId, submittedAt: new Date(), decidedAt: null },
    include: includeRelations,
  });

  await prisma.approval.create({
    data: { documentType: 'GRN', documentId: id, action: 'SUBMIT', actedById: req.user!.sub, comments: null },
  });

  await createNotification({
    userId: approverId,
    type: 'GRN_PENDING',
    title: 'Goods Received Note pending your approval',
    message: `GRN ${grn.grnNumber} against PO ${grn.po.poNumber} is waiting for your approval.`,
    documentType: 'GRN',
    documentId: id,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'GRN',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { grnId: id, submitted: true, approverId },
  });

  return grn;
}

function assertIsCurrentApprover(req: Request, grn: { currentApproverId: string | null }) {
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  if (!isSuperAdmin && grn.currentApproverId !== req.user!.sub) {
    throw ApiError.forbidden('Only the assigned approver (or a Super Admin) may act on this Goods Received Note');
  }
}

const NOTIFICATION_BY_ACTION: Record<'APPROVE' | 'REJECT' | 'RETURN', { type: 'GRN_APPROVED' | 'GRN_REJECTED' | 'GRN_RETURNED'; verb: string }> = {
  APPROVE: { type: 'GRN_APPROVED', verb: 'approved' },
  REJECT: { type: 'GRN_REJECTED', verb: 'rejected' },
  RETURN: { type: 'GRN_RETURNED', verb: 'returned' },
};

export async function decideGoodsReceivedNote(
  req: Request,
  id: string,
  action: 'APPROVE' | 'REJECT' | 'RETURN',
  comments: string | undefined,
  meta?: RequestMeta
) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status !== 'PENDING_APPROVAL') {
    throw ApiError.badRequest('This Goods Received Note is not pending approval');
  }
  assertIsCurrentApprover(req, existing);

  const nextStatus: GRNStatus = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'RETURNED';

  const grn = await prisma.goodsReceivedNote.update({
    where: { id },
    data: { status: nextStatus, decidedAt: new Date() },
    include: includeRelations,
  });

  await prisma.approval.create({
    data: { documentType: 'GRN', documentId: id, action, actedById: req.user!.sub, comments: comments || null },
  });

  if (existing.submittedById) {
    const notif = NOTIFICATION_BY_ACTION[action];
    await createNotification({
      userId: existing.submittedById,
      type: notif.type,
      title: `Goods Received Note ${notif.verb}`,
      message: `GRN ${grn.grnNumber} has been ${notif.verb}.`,
      documentType: 'GRN',
      documentId: id,
    });
  }

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'APPROVE',
    module: 'GRN',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { grnId: id, decision: action, comments },
  });

  return grn;
}

/// Route-gated to Super Admin only. Resets to Draft so the submitter can
/// edit and resubmit. Refused once the inventory update has been applied,
/// since re-editing quantities after stock was already credited would
/// silently desync InventoryItem from the GRN it came from.
export async function unlockGoodsReceivedNote(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status !== 'APPROVED') {
    throw ApiError.badRequest('Only Approved Goods Received Notes can be unlocked');
  }
  if (existing.inventoryUpdatedAt) {
    throw ApiError.badRequest('This GRN has already updated inventory and cannot be unlocked');
  }

  const grn = await prisma.goodsReceivedNote.update({
    where: { id },
    data: { status: 'DRAFT', currentApproverId: null, submittedAt: null, decidedAt: null },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'GRN',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { grnId: id, unlocked: true },
  });

  return grn;
}

/// The manual, post-approval "Update Inventory" step from the design brief
/// — separate from approval itself so a Store Incharge can physically
/// verify the goods before stock is credited. Finds-or-creates the
/// InventoryItem row per (project, costCode, description) and credits
/// workingQuantity by acceptedQty only; rejectedQty is logged on the
/// InventoryTransaction for audit but never added to any quantity field.
export async function updateInventoryFromGrn(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status !== 'APPROVED') {
    throw ApiError.badRequest('Inventory can only be updated from an Approved Goods Received Note');
  }
  if (existing.inventoryUpdatedAt) {
    throw ApiError.badRequest('Inventory has already been updated for this Goods Received Note');
  }

  await prisma.$transaction(async (tx) => {
    for (const item of existing.items) {
      if (!item.costCodeId) continue;

      const inventoryItem = await tx.inventoryItem.upsert({
        where: {
          projectId_costCodeId_itemDescription: {
            projectId: existing.projectId,
            costCodeId: item.costCodeId,
            itemDescription: item.description,
          },
        },
        update: {},
        create: {
          projectId: existing.projectId,
          costCodeId: item.costCodeId,
          itemDescription: item.description,
          unit: item.unit,
          workingQuantity: 0,
          nonWorkingQuantity: 0,
          createdById: req.user!.sub,
        },
      });

      const workingQtyAfter = round2(Number(inventoryItem.workingQuantity) + Number(item.acceptedQty));
      const nonWorkingQtyAfter = Number(inventoryItem.nonWorkingQuantity);

      await tx.inventoryItem.update({ where: { id: inventoryItem.id }, data: { workingQuantity: workingQtyAfter } });

      await tx.inventoryTransaction.create({
        data: {
          inventoryItemId: inventoryItem.id,
          projectId: existing.projectId,
          type: 'GRN_RECEIPT',
          workingQtyChange: Number(item.acceptedQty),
          nonWorkingQtyChange: 0,
          rejectedQtyChange: Number(item.rejectedQty),
          workingQtyAfter,
          nonWorkingQtyAfter,
          referenceGrnId: existing.id,
          remarks: `Received via GRN ${existing.grnNumber}`,
          performedById: req.user!.sub,
        },
      });
    }

    await tx.goodsReceivedNote.update({
      where: { id },
      data: { inventoryUpdatedAt: new Date(), inventoryUpdatedById: req.user!.sub },
    });
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'INVENTORY',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { grnId: id, inventoryUpdated: true },
  });

  return loadAndAuthorize(req, id);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
