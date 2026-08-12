import { Prisma, PRStatus, Role } from '@prisma/client';
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
  department: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true } },
  currentApprover: { select: { id: true, name: true, email: true } },
  items: { include: { costCode: { select: { id: true, code: true, name: true } } }, orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.PurchaseRequisitionInclude;

/// A PR can only be edited/submitted while Draft or Returned (sent back by
/// the approver with comments). Pending/Approved/Rejected are locked —
/// "Locked approved documents cannot be edited. Only Super Admin can
/// unlock" from the design brief; Rejected is treated as terminal (create
/// a fresh PR rather than resurrect a rejected one).
const EDITABLE_STATUSES: PRStatus[] = ['DRAFT', 'RETURNED'];

export interface PrItemInput {
  costCodeId: string;
  materialName: string;
  unit: string;
  totalReqQty: number;
  make?: string;
  modelNo?: string;
  qtyAvailableAtSite?: number;
  remarks?: string;
}

export interface PrFilters {
  projectId?: string;
  status?: string;
}

export async function listPurchaseRequisitions(req: Request, pagination: PaginationParams, filters: PrFilters) {
  const where: Prisma.PurchaseRequisitionWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.status ? { status: filters.status as PRStatus } : {}),
    ...(pagination.search
      ? {
          OR: [
            { requestNumber: { contains: pagination.search, mode: 'insensitive' } },
            { prNumber: { contains: pagination.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.purchaseRequisition.findMany({
      where,
      include: includeRelations,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'createdAt']: pagination.sortOrder },
    }),
    prisma.purchaseRequisition.count({ where }),
  ]);

  return { rows, total };
}

async function loadAndAuthorize(req: Request, id: string) {
  const record = await prisma.purchaseRequisition.findUnique({ where: { id }, include: includeRelations });
  if (!record) throw ApiError.notFound('Purchase Requisition not found');
  assertProjectAccess(req, record.projectId);
  return record;
}

export async function getPurchaseRequisition(req: Request, id: string) {
  const pr = await loadAndAuthorize(req, id);
  const approvalHistory = await prisma.approval.findMany({
    where: { documentType: 'PR', documentId: id },
    include: { actedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return { ...pr, approvalHistory };
}

/// balQtyReq is always server-computed from totalReqQty/qtyAvailableAtSite
/// — never trust a client-submitted total, same rule the Wages module
/// formula engine follows.
function computeItemData(item: PrItemInput, sortOrder: number) {
  const qtyAvailable = item.qtyAvailableAtSite ?? 0;
  const balQtyReq = Math.max(0, item.totalReqQty - qtyAvailable);
  return {
    costCodeId: item.costCodeId,
    materialName: item.materialName,
    unit: item.unit as Prisma.PurchaseRequisitionItemUncheckedCreateInput['unit'],
    totalReqQty: item.totalReqQty,
    make: item.make || null,
    modelNo: item.modelNo || null,
    qtyAvailableAtSite: qtyAvailable,
    balQtyReq,
    remarks: item.remarks || null,
    sortOrder,
  };
}

export interface CreatePrInput {
  projectId: string;
  prNumber?: string;
  departmentId?: string;
  siteInchargeName?: string;
  storeInchargeName?: string;
  items: PrItemInput[];
}

export async function createPurchaseRequisition(req: Request, input: CreatePrInput, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);

  const requestNumber = await nextDocumentNumber(input.projectId, 'PR');

  const pr = await prisma.purchaseRequisition.create({
    data: {
      projectId: input.projectId,
      requestNumber,
      prNumber: input.prNumber || null,
      requesterId: req.user!.sub,
      departmentId: input.departmentId || null,
      siteInchargeName: input.siteInchargeName || null,
      storeInchargeName: input.storeInchargeName || null,
      status: 'DRAFT',
      items: { create: input.items.map((it, idx) => computeItemData(it, idx)) },
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'PURCHASE_REQUISITION',
    projectId: pr.projectId,
    status: 'SUCCESS',
    meta,
    details: { prId: pr.id, requestNumber: pr.requestNumber },
  });

  return pr;
}

export type UpdatePrInput = Partial<Omit<CreatePrInput, 'projectId'>>;

export async function updatePurchaseRequisition(req: Request, id: string, input: UpdatePrInput, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw ApiError.badRequest(`This Purchase Requisition is ${existing.status.toLowerCase()} and cannot be edited`);
  }

  const pr = await prisma.$transaction(async (tx) => {
    if (input.items) {
      await tx.purchaseRequisitionItem.deleteMany({ where: { prId: id } });
    }
    return tx.purchaseRequisition.update({
      where: { id },
      data: {
        prNumber: input.prNumber !== undefined ? input.prNumber || null : undefined,
        departmentId: input.departmentId !== undefined ? input.departmentId || null : undefined,
        siteInchargeName: input.siteInchargeName !== undefined ? input.siteInchargeName || null : undefined,
        storeInchargeName: input.storeInchargeName !== undefined ? input.storeInchargeName || null : undefined,
        // A Returned PR being fixed goes back to Draft — resubmission is a
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
    module: 'PURCHASE_REQUISITION',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { prId: id },
  });

  return pr;
}

/// Regular users (whoever holds the PURCHASE_REQUISITION 'delete'
/// permission) may only ever remove their own Draft PRs — unchanged from
/// before. Super Admin additionally gets a permanent-delete power that
/// works on a PR in any status, including Approved, per the "Super Admin
/// can permanently delete" requirement — same endpoint, same permission
/// gate (requirePermission already lets Super Admin through
/// unconditionally), just an extra bypass on the status check below.
export async function deletePurchaseRequisition(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  const isSuperAdmin = req.user!.role === Role.SUPER_ADMIN;
  if (!isSuperAdmin && existing.status !== 'DRAFT') {
    throw ApiError.badRequest('Only Draft Purchase Requisitions can be deleted');
  }

  await prisma.$transaction([
    // POs raised from this PR are complete, self-contained documents (own
    // vendor/items/amounts) — they survive the PR's deletion, just losing
    // the "raised from" backlink, rather than being cascade-deleted or
    // blocking this delete outright.
    prisma.purchaseOrder.updateMany({ where: { prId: id }, data: { prId: null } }),
    // Approval/Attachment are intentionally polymorphic (not typed Prisma
    // relations — see the schema comment above PurchaseRequisitionItem),
    // so nothing FK-cascades them; clean them up explicitly to avoid
    // leaving orphan rows.
    prisma.attachment.deleteMany({ where: { ownerType: 'PR', ownerId: id } }),
    prisma.approval.deleteMany({ where: { documentType: 'PR', documentId: id } }),
    // PurchaseRequisitionItem cascades automatically (onDelete: Cascade).
    prisma.purchaseRequisition.delete({ where: { id } }),
  ]);

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'PURCHASE_REQUISITION',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { prId: id, requestNumber: existing.requestNumber, permanentDelete: existing.status !== 'DRAFT' },
  });
}

export async function listApprovers(req: Request, projectId: string) {
  assertProjectAccess(req, projectId);
  return listEligibleApprovers(projectId, 'PURCHASE_REQUISITION');
}

export async function submitPurchaseRequisition(req: Request, id: string, approverId: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw ApiError.badRequest(`This Purchase Requisition is ${existing.status.toLowerCase()} and cannot be submitted`);
  }
  if (!existing.items.length) {
    throw ApiError.badRequest('Add at least one item before submitting for approval');
  }

  const eligible = await listEligibleApprovers(existing.projectId, 'PURCHASE_REQUISITION');
  if (!eligible.some((u) => u.id === approverId)) {
    throw ApiError.badRequest('Selected approver is not eligible for this project');
  }

  const pr = await prisma.purchaseRequisition.update({
    where: { id },
    data: { status: 'PENDING_APPROVAL', currentApproverId: approverId, submittedAt: new Date(), decidedAt: null },
    include: includeRelations,
  });

  await prisma.approval.create({
    data: { documentType: 'PR', documentId: id, action: 'SUBMIT', actedById: req.user!.sub, comments: null },
  });

  await createNotification({
    userId: approverId,
    type: 'PR_SUBMITTED',
    title: 'Purchase Requisition pending your approval',
    message: `PR ${pr.requestNumber} is waiting for your approval.`,
    documentType: 'PR',
    documentId: id,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'PURCHASE_REQUISITION',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { prId: id, submitted: true, approverId },
  });

  return pr;
}

function assertIsCurrentApprover(req: Request, pr: { currentApproverId: string | null }) {
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  if (!isSuperAdmin && pr.currentApproverId !== req.user!.sub) {
    throw ApiError.forbidden('Only the assigned approver (or a Super Admin) may act on this Purchase Requisition');
  }
}

const NOTIFICATION_BY_ACTION: Record<'APPROVE' | 'REJECT' | 'RETURN', { type: 'PR_APPROVED' | 'PR_REJECTED' | 'PR_RETURNED'; verb: string }> = {
  APPROVE: { type: 'PR_APPROVED', verb: 'approved' },
  REJECT: { type: 'PR_REJECTED', verb: 'rejected' },
  RETURN: { type: 'PR_RETURNED', verb: 'returned to you' },
};

export async function decidePurchaseRequisition(
  req: Request,
  id: string,
  action: 'APPROVE' | 'REJECT' | 'RETURN',
  comments: string | undefined,
  meta?: RequestMeta
) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status !== 'PENDING_APPROVAL') {
    throw ApiError.badRequest('This Purchase Requisition is not pending approval');
  }
  assertIsCurrentApprover(req, existing);

  const nextStatus: PRStatus = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'RETURNED';

  const pr = await prisma.purchaseRequisition.update({
    where: { id },
    data: { status: nextStatus, decidedAt: new Date() },
    include: includeRelations,
  });

  await prisma.approval.create({
    data: { documentType: 'PR', documentId: id, action, actedById: req.user!.sub, comments: comments || null },
  });

  const notif = NOTIFICATION_BY_ACTION[action];
  await createNotification({
    userId: existing.requesterId,
    type: notif.type,
    title: `Purchase Requisition ${notif.verb}`,
    message: `PR ${pr.requestNumber} has been ${notif.verb}.`,
    documentType: 'PR',
    documentId: id,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'APPROVE',
    module: 'PURCHASE_REQUISITION',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { prId: id, decision: action, comments },
  });

  return pr;
}

/// Route-gated to Super Admin only (requireSuperAdmin) — "Only Super Admin
/// can unlock" from the design brief. Resets to Draft so the requester can
/// edit and resubmit.
export async function unlockPurchaseRequisition(req: Request, id: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);
  if (existing.status !== 'APPROVED') {
    throw ApiError.badRequest('Only Approved Purchase Requisitions can be unlocked');
  }

  const pr = await prisma.purchaseRequisition.update({
    where: { id },
    data: { status: 'DRAFT', currentApproverId: null, submittedAt: null, decidedAt: null },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'PURCHASE_REQUISITION',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { prId: id, unlocked: true },
  });

  return pr;
}
