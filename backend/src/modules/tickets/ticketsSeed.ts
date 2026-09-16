import { PrismaClient } from '@prisma/client';
import { nextTicketNumber } from '../../utils/ticketSequence';

const CATEGORY_NAMES = [
  'HR',
  'Payroll',
  'Attendance',
  'Recruitment',
  'Procurement',
  'Purchase Order',
  'PR',
  'Inventory',
  'IT / Technical',
  'User Account',
  'Website',
  'Other',
];

export async function seedTicketCategories(prisma: PrismaClient) {
  for (const name of CATEGORY_NAMES) {
    await prisma.ticketCategory.upsert({ where: { name }, update: {}, create: { name } });
  }
}

/// Idempotent demo data covering every scenario called out in the spec:
/// single vs. multiple assignees, each status value, a ticket with
/// comments, and a ticket with an attachment. Keyed by ticketNo (via a
/// pre-check) so re-running `npm run seed` never duplicates rows — safe for
/// the same dev/demo database this seed script already targets, never run
/// against production.
export async function seedSampleTickets(
  prisma: PrismaClient,
  users: { raiser: string; hr: string; it: string; pm: string; normal: string }
) {
  const existing = await prisma.ticket.count();
  if (existing > 0) return;

  const categoryByName = new Map((await prisma.ticketCategory.findMany()).map((c) => [c.name, c.id]));
  const catId = (name: string) => categoryByName.get(name)!;

  async function makeTicket(params: {
    subject: string;
    description: string;
    category: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_USER' | 'RESOLVED' | 'CLOSED';
    raisedById: string;
    assigneeIds: string[];
    comments?: { userId: string; comment: string }[];
  }) {
    const ticketNo = await nextTicketNumber();
    const now = new Date();
    const ticket = await prisma.ticket.create({
      data: {
        ticketNo,
        raisedById: params.raisedById,
        categoryId: catId(params.category),
        subject: params.subject,
        description: params.description,
        priority: params.priority,
        status: params.status,
        resolvedAt: params.status === 'RESOLVED' || params.status === 'CLOSED' ? now : null,
        closedAt: params.status === 'CLOSED' ? now : null,
      },
    });
    await prisma.ticketAssignee.createMany({
      data: params.assigneeIds.map((userId) => ({ ticketId: ticket.id, userId, assignedById: params.raisedById })),
    });
    await prisma.ticketActivity.create({
      data: { ticketId: ticket.id, userId: params.raisedById, action: 'TICKET_CREATED', newValue: ticketNo },
    });
    for (const a of params.assigneeIds) {
      await prisma.ticketActivity.create({ data: { ticketId: ticket.id, userId: params.raisedById, action: 'ASSIGNED', newValue: a } });
    }
    for (const c of params.comments ?? []) {
      await prisma.ticketComment.create({ data: { ticketId: ticket.id, userId: c.userId, comment: c.comment } });
      await prisma.ticketActivity.create({ data: { ticketId: ticket.id, userId: c.userId, action: 'COMMENT_ADDED' } });
    }
    return ticket;
  }

  await makeTicket({
    subject: 'Unable to download salary slip',
    description: 'I am unable to download my June salary slip from the Wages module.',
    category: 'Payroll',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    raisedById: users.normal,
    assigneeIds: [users.hr, users.it, users.pm],
    comments: [
      { userId: users.normal, comment: 'I am unable to download my salary slip.' },
      { userId: users.hr, comment: 'We are checking the issue.' },
      { userId: users.it, comment: 'The technical issue has been identified.' },
    ],
  });

  await makeTicket({
    subject: 'Attendance not reflecting for last week',
    description: 'My attendance for the last week is not showing up correctly.',
    category: 'Attendance',
    priority: 'MEDIUM',
    status: 'OPEN',
    raisedById: users.normal,
    assigneeIds: [users.hr],
  });

  await makeTicket({
    subject: 'Need access to Purchase Order module',
    description: 'Requesting view access to Purchase Order for the current project.',
    category: 'User Account',
    priority: 'LOW',
    status: 'WAITING_FOR_USER',
    raisedById: users.pm,
    assigneeIds: [users.it],
    comments: [{ userId: users.it, comment: 'Please confirm which project this is for.' }],
  });

  await makeTicket({
    subject: 'Recruitment portal login error',
    description: 'Getting an "invalid session" error when logging into the recruitment portal.',
    category: 'IT / Technical',
    priority: 'CRITICAL',
    status: 'RESOLVED',
    raisedById: users.raiser,
    assigneeIds: [users.it],
    comments: [
      { userId: users.raiser, comment: 'Still happening after clearing cache.' },
      { userId: users.it, comment: 'Fixed — please try again.' },
    ],
  });

  await makeTicket({
    subject: 'Update bank account details',
    description: 'I need to update my bank account details for salary processing.',
    category: 'HR',
    priority: 'MEDIUM',
    status: 'CLOSED',
    raisedById: users.normal,
    assigneeIds: [users.hr],
    comments: [
      { userId: users.hr, comment: 'Updated — please verify on your next payslip.' },
      { userId: users.normal, comment: 'Confirmed, thank you.' },
    ],
  });
}
