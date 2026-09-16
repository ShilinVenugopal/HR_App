import { Request } from 'express';
import { ModuleName, Prisma, Role, TicketPriority, TicketStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { nextTicketNumber } from '../../utils/ticketSequence';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { createNotification } from '../notifications/notifications.service';
import { RequestMeta } from '../../utils/requestMeta';

const userSummarySelect = { id: true, name: true, email: true, role: true } satisfies Prisma.UserSelect;

const ticketListInclude = {
  raisedBy: { select: userSummarySelect },
  category: true,
  assignees: { include: { user: { select: userSummarySelect } } },
} satisfies Prisma.TicketInclude;

const ticketDetailInclude = {
  ...ticketListInclude,
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      user: { select: userSummarySelect },
      attachments: { include: { uploadedBy: { select: userSummarySelect } } },
    },
  },
  attachments: {
    where: { commentId: null },
    include: { uploadedBy: { select: userSummarySelect } },
  },
  activity: {
    orderBy: { createdAt: 'asc' as const },
    include: { user: { select: userSummarySelect } },
  },
} satisfies Prisma.TicketInclude;

/// Mirrors permission.middleware.ts's ACTION_TO_CLAIM check, but callable
/// from inside a service (not just as route middleware) — needed here
/// because "can this user change this specific ticket's status" depends on
/// BOTH their module permission AND whether they're the raiser/an assignee,
/// a combination requirePermission() alone can't express.
function hasModuleAction(req: Request, action: 'view' | 'add' | 'edit' | 'delete' | 'approve'): boolean {
  const user = req.user!;
  if (user.role === Role.SUPER_ADMIN) return true;
  const claim = user.permissions['TICKETS'];
  if (!claim) return false;
  const key = { view: 'canView', add: 'canAdd', edit: 'canEdit', delete: 'canDelete', approve: 'canApprove' }[action] as keyof typeof claim;
  return Boolean(claim[key]);
}

/// "All Tickets" / org-wide dashboard visibility — Super Admin always,
/// otherwise only users explicitly granted the elevated TICKETS.canApprove
/// flag (repurposed here as "view across all users' tickets", the same way
/// canApprove already means "elevated authority" in every other module).
function isTicketAdmin(req: Request): boolean {
  return req.user!.role === Role.SUPER_ADMIN || hasModuleAction(req, 'approve') || hasModuleAction(req, 'edit');
}

function isElevatedViewer(req: Request): boolean {
  return req.user!.role === Role.SUPER_ADMIN || hasModuleAction(req, 'approve');
}

async function isTicketParticipant(req: Request, ticketId: string): Promise<boolean> {
  const userId = req.user!.sub;
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, OR: [{ raisedById: userId }, { assignees: { some: { userId } } }] },
    select: { id: true },
  });
  return Boolean(ticket);
}

/// A ticket is visible to: whoever raised it, any current assignee, or an
/// elevated viewer (Super Admin / TICKETS canApprove). This is the single
/// access predicate every read/write below relies on — changing a ticket ID
/// in the URL can never surface a ticket outside this set, because it's
/// folded directly into the Prisma `where` clause rather than checked only
/// after the fact in application code.
function accessWhere(req: Request): Prisma.TicketWhereInput {
  if (isElevatedViewer(req)) return {};
  const userId = req.user!.sub;
  return { OR: [{ raisedById: userId }, { assignees: { some: { userId } } }] };
}

export interface TicketFilters {
  scope?: 'mine' | 'assigned' | 'all';
  status?: TicketStatus;
  priority?: TicketPriority;
  categoryId?: string;
  raisedById?: string;
  assignedToId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function listTickets(req: Request, pagination: PaginationParams, filters: TicketFilters) {
  const userId = req.user!.sub;
  const where: Prisma.TicketWhereInput = { AND: [] };
  const and = where.AND as Prisma.TicketWhereInput[];

  if (filters.scope === 'mine') {
    and.push({ raisedById: userId });
  } else if (filters.scope === 'assigned') {
    and.push({ assignees: { some: { userId } } });
  } else if (filters.scope === 'all') {
    if (!isElevatedViewer(req)) {
      throw ApiError.forbidden('You do not have permission to view all tickets');
    }
    // no extra restriction — every ticket is in scope
  } else {
    // Default (no scope given): own + assigned, unless the caller is an
    // elevated viewer, matching accessWhere()'s access predicate exactly.
    and.push(accessWhere(req));
  }

  if (filters.status) and.push({ status: filters.status });
  if (filters.priority) and.push({ priority: filters.priority });
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  if (filters.raisedById) and.push({ raisedById: filters.raisedById });
  if (filters.assignedToId) and.push({ assignees: { some: { userId: filters.assignedToId } } });
  if (filters.dateFrom || filters.dateTo) {
    and.push({
      createdAt: {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) } : {}),
      },
    });
  }
  if (pagination.search) {
    and.push({
      OR: [
        { ticketNo: { contains: pagination.search, mode: 'insensitive' } },
        { subject: { contains: pagination.search, mode: 'insensitive' } },
        { description: { contains: pagination.search, mode: 'insensitive' } },
        { raisedBy: { name: { contains: pagination.search, mode: 'insensitive' } } },
        { assignees: { some: { user: { name: { contains: pagination.search, mode: 'insensitive' } } } } },
      ],
    });
  }

  const [rows, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: ticketListInclude,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'createdAt']: pagination.sortOrder },
    }),
    prisma.ticket.count({ where }),
  ]);

  return { rows, total };
}

export async function getTicketDetail(req: Request, id: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id, ...(isElevatedViewer(req) ? {} : accessWhere(req)) },
    include: ticketDetailInclude,
  });
  if (!ticket) throw ApiError.notFound('Ticket not found');
  return ticket;
}

export interface CreateTicketInput {
  module?: ModuleName | null;
  categoryId: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  assigneeIds: string[];
}

export async function createTicket(req: Request, input: CreateTicketInput, meta?: RequestMeta) {
  const raisedById = req.user!.sub;

  const category = await prisma.ticketCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw ApiError.badRequest('Selected category does not exist');

  const uniqueAssigneeIds = Array.from(new Set(input.assigneeIds));
  const validAssignees = await prisma.user.findMany({ where: { id: { in: uniqueAssigneeIds } }, select: { id: true, name: true } });
  if (validAssignees.length !== uniqueAssigneeIds.length) {
    throw ApiError.badRequest('One or more selected assignees do not exist');
  }

  const ticketNo = await nextTicketNumber();

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.ticket.create({
      data: {
        ticketNo,
        raisedById,
        module: input.module ?? null,
        categoryId: input.categoryId,
        subject: input.subject,
        description: input.description,
        priority: input.priority,
        status: 'OPEN',
      },
    });

    await tx.ticketAssignee.createMany({
      data: uniqueAssigneeIds.map((userId) => ({ ticketId: created.id, userId, assignedById: raisedById })),
    });

    await tx.ticketActivity.create({
      data: { ticketId: created.id, userId: raisedById, action: 'TICKET_CREATED', newValue: ticketNo },
    });
    await tx.ticketActivity.createMany({
      data: validAssignees.map((a) => ({
        ticketId: created.id,
        userId: raisedById,
        action: 'ASSIGNED',
        newValue: a.name,
      })),
    });

    return created;
  });

  await recordAuditLog({
    userId: raisedById,
    action: 'CREATE',
    module: 'TICKETS',
    status: 'SUCCESS',
    meta,
    details: { ticketId: ticket.id, ticketNo },
  });

  await Promise.all(
    validAssignees.map((a) =>
      createNotification({
        userId: a.id,
        type: 'TICKET_ASSIGNED',
        title: `New Ticket Assigned: ${ticketNo}`,
        message: `${req.user!.email} assigned you ticket ${ticketNo}: ${input.subject}`,
        documentId: ticket.id,
      })
    )
  );

  return getTicketDetail(req, ticket.id);
}

async function assertCanAccessTicket(req: Request, ticketId: string) {
  if (isElevatedViewer(req)) return;
  const participant = await isTicketParticipant(req, ticketId);
  if (!participant) throw ApiError.notFound('Ticket not found');
}

export interface AddCommentInput {
  comment: string;
}

export async function addComment(req: Request, ticketId: string, input: AddCommentInput, meta?: RequestMeta) {
  await assertCanAccessTicket(req, ticketId);
  const userId = req.user!.sub;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { raisedBy: { select: userSummarySelect }, assignees: { select: { userId: true } } },
  });
  if (!ticket) throw ApiError.notFound('Ticket not found');

  const created = await prisma.$transaction(async (tx) => {
    const commentRow = await tx.ticketComment.create({
      data: { ticketId, userId, comment: input.comment },
    });
    await tx.ticketActivity.create({
      data: { ticketId, userId, action: 'COMMENT_ADDED' },
    });
    return commentRow;
  });

  const recipientIds = new Set<string>([ticket.raisedById, ...ticket.assignees.map((a) => a.userId)]);
  recipientIds.delete(userId);
  await Promise.all(
    Array.from(recipientIds).map((recipientId) =>
      createNotification({
        userId: recipientId,
        type: 'TICKET_COMMENT_ADDED',
        title: `New reply on Ticket ${ticket.ticketNo}`,
        message: `${req.user!.email} replied on ${ticket.ticketNo}`,
        documentId: ticketId,
      })
    )
  );

  return getTicketDetail(req, ticketId);
}

/// Forward/backward transitions the workflow allows, and who may perform
/// each one. 'raiser' = whoever opened the ticket; 'assignee' = anyone
/// currently assigned; 'admin' = isTicketAdmin(req) (Super Admin, or TICKETS
/// canEdit/canApprove). A transition not listed here is rejected outright.
const TRANSITIONS: Record<TicketStatus, Partial<Record<TicketStatus, Array<'raiser' | 'assignee' | 'admin'>>>> = {
  OPEN: { IN_PROGRESS: ['assignee', 'admin'] },
  IN_PROGRESS: {
    WAITING_FOR_USER: ['assignee', 'admin'],
    RESOLVED: ['assignee', 'admin'],
  },
  WAITING_FOR_USER: { IN_PROGRESS: ['raiser', 'assignee', 'admin'] },
  RESOLVED: {
    CLOSED: ['raiser', 'admin'],
    IN_PROGRESS: ['raiser', 'admin'],
  },
  CLOSED: { IN_PROGRESS: ['admin'] },
};

export async function changeStatus(req: Request, ticketId: string, status: TicketStatus, meta?: RequestMeta) {
  await assertCanAccessTicket(req, ticketId);
  const userId = req.user!.sub;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { assignees: { select: { userId: true } } },
  });
  if (!ticket) throw ApiError.notFound('Ticket not found');
  const ticketNo = ticket.ticketNo;

  if (ticket.status === status) return getTicketDetail(req, ticketId);

  const allowedActors = TRANSITIONS[ticket.status]?.[status];
  if (!allowedActors) {
    throw ApiError.badRequest(`Cannot change status from ${ticket.status} to ${status}`);
  }

  const isRaiser = ticket.raisedById === userId;
  const isAssignee = ticket.assignees.some((a) => a.userId === userId);
  const admin = isTicketAdmin(req);
  const authorized =
    (allowedActors.includes('raiser') && isRaiser) ||
    (allowedActors.includes('assignee') && isAssignee) ||
    (allowedActors.includes('admin') && admin);

  if (!authorized) {
    throw ApiError.forbidden('You are not authorized to change this ticket to that status');
  }

  const timestamps: Prisma.TicketUpdateInput = {};
  if (status === 'RESOLVED') timestamps.resolvedAt = new Date();
  if (status === 'CLOSED') timestamps.closedAt = new Date();
  if (status === 'IN_PROGRESS' && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED')) {
    timestamps.resolvedAt = null;
    timestamps.closedAt = null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: ticketId }, data: { status, ...timestamps } });
    await tx.ticketActivity.create({
      data: { ticketId, userId, action: 'STATUS_CHANGED', oldValue: ticket.status, newValue: status },
    });
  });

  const recipientIds = new Set<string>([ticket.raisedById, ...ticket.assignees.map((a) => a.userId)]);
  recipientIds.delete(userId);
  await Promise.all(
    Array.from(recipientIds).map((recipientId) =>
      createNotification({
        userId: recipientId,
        type: 'TICKET_STATUS_CHANGED',
        title: `Ticket ${ticketNo} status updated`,
        message: `Ticket has been marked as ${STATUS_LABELS[status]}.`,
        documentId: ticketId,
      })
    )
  );

  return getTicketDetail(req, ticketId);
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_USER: 'Waiting for User',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export async function changePriority(req: Request, ticketId: string, priority: TicketPriority, meta?: RequestMeta) {
  await assertCanAccessTicket(req, ticketId);
  const userId = req.user!.sub;

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw ApiError.notFound('Ticket not found');
  if (ticket.priority === priority) return getTicketDetail(req, ticketId);

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: ticketId }, data: { priority } });
    await tx.ticketActivity.create({
      data: { ticketId, userId, action: 'PRIORITY_CHANGED', oldValue: ticket.priority, newValue: priority },
    });
  });

  return getTicketDetail(req, ticketId);
}

export async function manageAssignees(req: Request, ticketId: string, assigneeIds: string[], meta?: RequestMeta) {
  await assertCanAccessTicket(req, ticketId);
  const userId = req.user!.sub;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { assignees: { include: { user: { select: userSummarySelect } } } },
  });
  if (!ticket) throw ApiError.notFound('Ticket not found');

  const uniqueIds = Array.from(new Set(assigneeIds));
  const validUsers = await prisma.user.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } });
  if (validUsers.length !== uniqueIds.length) throw ApiError.badRequest('One or more selected assignees do not exist');

  const currentIds = new Set(ticket.assignees.map((a) => a.userId));
  const nextIds = new Set(uniqueIds);
  const toAdd = validUsers.filter((u) => !currentIds.has(u.id));
  const toRemove = ticket.assignees.filter((a) => !nextIds.has(a.userId));

  if (!toAdd.length && !toRemove.length) return getTicketDetail(req, ticketId);

  await prisma.$transaction(async (tx) => {
    if (toAdd.length) {
      await tx.ticketAssignee.createMany({
        data: toAdd.map((u) => ({ ticketId, userId: u.id, assignedById: userId })),
      });
    }
    if (toRemove.length) {
      await tx.ticketAssignee.deleteMany({ where: { ticketId, userId: { in: toRemove.map((a) => a.userId) } } });
    }
    await tx.ticketActivity.createMany({
      data: [
        ...toAdd.map((u) => ({ ticketId, userId, action: 'ASSIGNED', newValue: u.name })),
        ...toRemove.map((a) => ({ ticketId, userId, action: 'UNASSIGNED', oldValue: a.user.name })),
      ],
    });
  });

  await Promise.all(
    toAdd.map((u) =>
      createNotification({
        userId: u.id,
        type: 'TICKET_ASSIGNED',
        title: `New Ticket Assigned: ${ticket.ticketNo}`,
        message: `You have been assigned ticket ${ticket.ticketNo}: ${ticket.subject}`,
        documentId: ticketId,
      })
    )
  );

  return getTicketDetail(req, ticketId);
}

export interface AttachFileInput {
  commentId?: string | null;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType?: string | null;
}

/// Records metadata for a file already uploaded via the shared POST
/// /api/v1/uploads endpoint — this module never handles raw file bytes
/// itself, matching every other attachment feature in this app.
export async function attachFile(req: Request, ticketId: string, input: AttachFileInput, meta?: RequestMeta) {
  await assertCanAccessTicket(req, ticketId);
  const userId = req.user!.sub;

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw ApiError.notFound('Ticket not found');

  if (input.commentId) {
    const comment = await prisma.ticketComment.findFirst({ where: { id: input.commentId, ticketId } });
    if (!comment) throw ApiError.badRequest('Comment not found on this ticket');
  }

  await prisma.$transaction(async (tx) => {
    await tx.ticketAttachment.create({
      data: {
        ticketId,
        commentId: input.commentId ?? null,
        uploadedById: userId,
        fileName: input.fileName,
        filePath: input.filePath,
        fileSize: input.fileSize,
        mimeType: input.mimeType ?? null,
      },
    });
    await tx.ticketActivity.create({
      data: { ticketId, userId, action: 'ATTACHMENT_ADDED', newValue: input.fileName },
    });
  });

  return getTicketDetail(req, ticketId);
}

/// Lightweight user lookup for the Assign To multi-select — deliberately
/// not the full /users endpoint (that's Super-Admin-only, since it exposes
/// user management actions). Any authenticated user with TICKETS access
/// needs to see id/name/email/role for every active user to assign a
/// ticket, without needing User Management permission.
export async function listAssignableUsers() {
  return prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  });
}

export async function getDashboardStats(req: Request) {
  const userId = req.user!.sub;
  const own = accessWhere(req);

  const countBy = async (where: Prisma.TicketWhereInput) => prisma.ticket.count({ where });

  const [total, open, inProgress, waiting, resolved, closed] = await Promise.all([
    countBy(own),
    countBy({ ...own, status: 'OPEN' }),
    countBy({ ...own, status: 'IN_PROGRESS' }),
    countBy({ ...own, status: 'WAITING_FOR_USER' }),
    countBy({ ...own, status: 'RESOLVED' }),
    countBy({ ...own, status: 'CLOSED' }),
  ]);

  const mine = { total, open, inProgress, waiting, resolved, closed, raisedByMe: await countBy({ raisedById: userId }) };

  if (!isElevatedViewer(req)) return { mine, organization: null };

  const [oTotal, oOpen, oInProgress, oWaiting, oResolved, oClosed, byCategory, byPriority] = await Promise.all([
    countBy({}),
    countBy({ status: 'OPEN' }),
    countBy({ status: 'IN_PROGRESS' }),
    countBy({ status: 'WAITING_FOR_USER' }),
    countBy({ status: 'RESOLVED' }),
    countBy({ status: 'CLOSED' }),
    prisma.ticket.groupBy({ by: ['categoryId'], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['priority'], _count: { _all: true } }),
  ]);

  const categories = await prisma.ticketCategory.findMany({ where: { id: { in: byCategory.map((c) => c.categoryId) } } });
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const organization = {
    total: oTotal,
    open: oOpen,
    inProgress: oInProgress,
    waiting: oWaiting,
    resolved: oResolved,
    closed: oClosed,
    byCategory: byCategory.map((c) => ({ category: categoryMap.get(c.categoryId) ?? 'Unknown', count: c._count._all })),
    byPriority: byPriority.map((p) => ({ priority: p.priority, count: p._count._all })),
  };

  return { mine, organization };
}

export async function deleteTicket(req: Request, ticketId: string, meta?: RequestMeta) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw ApiError.notFound('Ticket not found');

  await prisma.ticket.delete({ where: { id: ticketId } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'TICKETS',
    status: 'SUCCESS',
    meta,
    details: { ticketId, ticketNo: ticket.ticketNo },
  });
}
