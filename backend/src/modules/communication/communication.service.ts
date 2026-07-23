import { CommChannel, Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';
import { emailProvider } from '../../providers/email.provider';
import { whatsappProvider } from '../../providers/whatsapp.provider';
import { env } from '../../config/env';

// ── Templates ──────────────────────────────────────────────────────────

export async function listTemplates(channel?: CommChannel) {
  return prisma.communicationTemplate.findMany({
    where: channel ? { channel } : {},
    orderBy: { name: 'asc' },
  });
}

export async function createTemplate(
  req: Request,
  input: { name: string; channel: CommChannel; category?: string; subject?: string; body: string },
  meta?: RequestMeta
) {
  const template = await prisma.communicationTemplate.create({
    data: { ...input, createdById: req.user!.sub },
  });
  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'RECRUITMENT',
    status: 'SUCCESS',
    meta,
    details: { communicationTemplate: true, templateId: template.id, name: template.name },
  });
  return template;
}

export async function updateTemplate(
  req: Request,
  id: string,
  input: Partial<{ name: string; channel: CommChannel; category: string; subject: string; body: string }>,
  meta?: RequestMeta
) {
  const existing = await prisma.communicationTemplate.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Template not found');

  const template = await prisma.communicationTemplate.update({ where: { id }, data: input });
  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'RECRUITMENT',
    status: 'SUCCESS',
    meta,
    details: { communicationTemplate: true, templateId: id, changes: input },
  });
  return template;
}

export async function duplicateTemplate(req: Request, id: string, meta?: RequestMeta) {
  const existing = await prisma.communicationTemplate.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Template not found');

  const copy = await prisma.communicationTemplate.create({
    data: {
      name: `${existing.name} (Copy)`,
      channel: existing.channel,
      category: existing.category,
      subject: existing.subject,
      body: existing.body,
      createdById: req.user!.sub,
    },
  });
  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'RECRUITMENT',
    status: 'SUCCESS',
    meta,
    details: { communicationTemplate: true, templateId: copy.id, duplicatedFrom: id },
  });
  return copy;
}

export async function deleteTemplate(req: Request, id: string, meta?: RequestMeta) {
  const existing = await prisma.communicationTemplate.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Template not found');

  await prisma.communicationTemplate.delete({ where: { id } });
  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'RECRUITMENT',
    status: 'SUCCESS',
    meta,
    details: { communicationTemplate: true, templateId: id },
  });
}

// ── Personalization ───────────────────────────────────────────────────

interface CandidateLike {
  candidateName: string;
  contactNumber: string;
  email?: string | null;
  qualification?: string | null;
  experience?: string | null;
  remarks?: string | null;
  designation?: { name: string } | null;
  project?: { projectName: string; clientName: string; location?: string | null } | null;
}

/// All 13 supported {{placeholders}}. Unknown placeholders are left as-is
/// (not blanked out) so a typo is visible to the sender rather than
/// silently disappearing.
function buildPlaceholderContext(
  candidate: CandidateLike,
  variables: Record<string, string> | undefined,
  senderName: string
): Record<string, string> {
  return {
    candidate_name: candidate.candidateName,
    designation: candidate.designation?.name ?? '',
    assigned_project: candidate.project?.projectName ?? '',
    qualification: candidate.qualification ?? '',
    experience: candidate.experience ?? '',
    contact_number: candidate.contactNumber,
    email: candidate.email ?? '',
    remarks: candidate.remarks ?? '',
    client_name: candidate.project?.clientName ?? '',
    interview_date: variables?.interview_date ?? '',
    interview_time: variables?.interview_time ?? '',
    location: variables?.location ?? candidate.project?.location ?? '',
    recruiter_name: senderName,
  };
}

function renderTemplate(text: string, context: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (key in context ? context[key] : match));
}

// ── Bulk send ──────────────────────────────────────────────────────────

export interface BulkSendInput {
  channel: CommChannel;
  candidateIds: string[];
  templateId?: string | null;
  subject?: string;
  body: string;
  attachments?: { filename: string; url: string }[];
  scheduledAt?: Date | null;
  variables?: Record<string, string>;
}

export async function createBulkSend(req: Request, input: BulkSendInput, meta?: RequestMeta) {
  const candidates = await prisma.recruitmentCandidate.findMany({
    where: { id: { in: input.candidateIds }, ...projectScopeWhere(req) },
    include: { project: true, designation: true },
  });
  if (!candidates.length) {
    throw ApiError.badRequest('None of the selected candidates are in your accessible projects');
  }

  const senderName = req.user!.name;

  const batch = await prisma.communicationBatch.create({
    data: {
      channel: input.channel,
      templateId: input.templateId || null,
      subject: input.channel === 'EMAIL' ? input.subject || null : null,
      body: input.body,
      attachments: input.attachments && input.attachments.length ? (input.attachments as unknown as Prisma.InputJsonValue) : undefined,
      scheduledAt: input.scheduledAt ?? null,
      totalRecipients: candidates.length,
      createdById: req.user!.sub,
    },
  });

  const logsData: Prisma.CommunicationMessageLogCreateManyInput[] = candidates.map((candidate) => {
    const context = buildPlaceholderContext(candidate, input.variables, senderName);
    const renderedBody = renderTemplate(input.body, context);
    const renderedSubject = input.subject ? renderTemplate(input.subject, context) : null;
    const recipient = input.channel === 'EMAIL' ? candidate.email : candidate.contactNumber;
    const missingContact = !recipient;

    return {
      batchId: batch.id,
      candidateId: candidate.id,
      projectId: candidate.projectId,
      channel: input.channel,
      recipientEmail: input.channel === 'EMAIL' ? candidate.email : null,
      recipientPhone: input.channel === 'WHATSAPP' ? candidate.contactNumber : null,
      subject: renderedSubject,
      body: renderedBody,
      status: missingContact ? 'FAILED' : 'QUEUED',
      errorReason: missingContact
        ? `Candidate has no ${input.channel === 'EMAIL' ? 'email address' : 'contact number'} on file`
        : null,
      failedAt: missingContact ? new Date() : null,
      scheduledAt: input.scheduledAt ?? null,
    };
  });

  await prisma.communicationMessageLog.createMany({ data: logsData });

  const failedUpfront = logsData.filter((l) => l.status === 'FAILED').length;
  if (failedUpfront) {
    await prisma.communicationBatch.update({ where: { id: batch.id }, data: { failedCount: failedUpfront } });
  }

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'RECRUITMENT',
    status: 'SUCCESS',
    meta,
    details: {
      bulkCommunication: true,
      channel: input.channel,
      batchId: batch.id,
      recipients: candidates.length,
      scheduledAt: input.scheduledAt,
    },
  });

  return prisma.communicationBatch.findUnique({ where: { id: batch.id } });
}

export interface SendTestInput {
  channel: CommChannel;
  subject?: string;
  body: string;
  testRecipient: string;
  variables?: Record<string, string>;
}

/// Sends immediately, outside the queue, to a single address the sender
/// controls — used for the "Send Test Email" / "Send Test" buttons. Never
/// persists a batch/message-log row; this is a preview aid, not a real send.
export async function sendTestMessage(req: Request, input: SendTestInput) {
  const dummyCandidate: CandidateLike = {
    candidateName: 'Test Candidate',
    contactNumber: input.testRecipient,
    email: input.testRecipient,
    qualification: 'Sample Qualification',
    experience: '3 Years',
    remarks: 'Sample remarks',
    designation: { name: 'Sample Designation' },
    project: { projectName: 'Sample Project', clientName: 'Sample Client', location: 'Sample Location' },
  };
  const context = buildPlaceholderContext(dummyCandidate, input.variables, req.user!.name);
  const renderedBody = renderTemplate(input.body, context);
  const renderedSubject = input.subject ? renderTemplate(input.subject, context) : undefined;

  if (input.channel === 'EMAIL') {
    return emailProvider.send({ to: input.testRecipient, subject: `[TEST] ${renderedSubject ?? ''}`, html: renderedBody });
  }
  return whatsappProvider.send({ to: input.testRecipient, body: `[TEST]\n${renderedBody}` });
}

// ── History / timeline / stats ────────────────────────────────────────

export interface HistoryFilters {
  search?: string;
  channel?: string;
  status?: string;
  projectId?: string;
  templateId?: string;
  recruiterId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listHistory(req: Request, pagination: PaginationParams, filters: HistoryFilters) {
  const where: Prisma.CommunicationMessageLogWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.channel ? { channel: filters.channel as CommChannel } : {}),
    ...(filters.status ? { status: filters.status as any } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.templateId ? { batch: { templateId: filters.templateId } } : {}),
    ...(filters.recruiterId ? { batch: { createdById: filters.recruiterId } } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          createdAt: {
            ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
            ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { candidate: { candidateName: { contains: filters.search, mode: 'insensitive' } } },
            { recipientEmail: { contains: filters.search, mode: 'insensitive' } },
            { recipientPhone: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.communicationMessageLog.findMany({
      where,
      include: {
        candidate: { select: { id: true, candidateName: true, email: true, contactNumber: true } },
        project: { select: { id: true, projectName: true } },
        batch: {
          select: {
            id: true,
            template: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
            attachments: true,
          },
        },
      },
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { createdAt: pagination.sortOrder },
    }),
    prisma.communicationMessageLog.count({ where }),
  ]);

  return { rows, total };
}

export async function getCandidateTimeline(req: Request, candidateId: string) {
  const candidate = await prisma.recruitmentCandidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw ApiError.notFound('Candidate not found');
  assertProjectAccess(req, candidate.projectId);

  return prisma.communicationMessageLog.findMany({
    where: { candidateId },
    include: { batch: { select: { template: { select: { name: true } }, createdBy: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function resendMessage(req: Request, id: string, meta?: RequestMeta) {
  const log = await prisma.communicationMessageLog.findUnique({ where: { id } });
  if (!log) throw ApiError.notFound('Message not found');
  assertProjectAccess(req, log.projectId);

  const updated = await prisma.communicationMessageLog.update({
    where: { id },
    data: {
      status: 'QUEUED',
      attempts: 0,
      errorReason: null,
      failedAt: null,
      bouncedAt: null,
      scheduledAt: new Date(),
    },
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'RECRUITMENT',
    projectId: log.projectId,
    status: 'SUCCESS',
    meta,
    details: { communicationResend: true, messageLogId: id },
  });

  return updated;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getCommunicationStats(req: Request) {
  const scope = projectScopeWhere(req);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const last30 = new Date(Date.now() - 30 * DAY_MS);

  const [emailsSentToday, whatsappSentToday, pendingScheduled, failedLast30, emailStatsLast30, contactedLast30] = await Promise.all([
    prisma.communicationMessageLog.count({
      where: { ...scope, channel: 'EMAIL', sentAt: { gte: todayStart }, status: { in: ['SENT', 'DELIVERED', 'OPENED'] } },
    }),
    prisma.communicationMessageLog.count({
      where: { ...scope, channel: 'WHATSAPP', sentAt: { gte: todayStart }, status: { in: ['SENT', 'DELIVERED', 'OPENED'] } },
    }),
    prisma.communicationMessageLog.count({ where: { ...scope, status: 'QUEUED', scheduledAt: { gt: new Date() } } }),
    prisma.communicationMessageLog.count({ where: { ...scope, status: { in: ['FAILED', 'BOUNCED'] }, createdAt: { gte: last30 } } }),
    prisma.communicationMessageLog.groupBy({
      by: ['status'],
      where: { ...scope, channel: 'EMAIL', createdAt: { gte: last30 }, status: { in: ['SENT', 'DELIVERED', 'OPENED'] } },
      _count: { _all: true },
    }),
    prisma.communicationMessageLog.findMany({
      where: { ...scope, createdAt: { gte: last30 }, status: { in: ['SENT', 'DELIVERED', 'OPENED'] } },
      select: { candidateId: true, candidate: { select: { status: true } } },
      distinct: ['candidateId'],
    }),
  ]);

  const emailSentOrBetter = emailStatsLast30.reduce((sum, r) => sum + r._count._all, 0);
  const emailOpened = emailStatsLast30.find((r) => r.status === 'OPENED')?._count._all ?? 0;
  const openRate = emailSentOrBetter > 0 ? Math.round((emailOpened / emailSentOrBetter) * 1000) / 10 : 0;

  // "Response rate" has no dedicated inbound-reply tracking (that would
  // require ingesting email/WhatsApp replies, out of scope). Approximated
  // as: of candidates contacted in the last 30 days, what share have moved
  // past their default APPLIED status since — a reasonable proxy for
  // engagement without a real reply pipeline.
  const contactedCount = contactedLast30.length;
  const respondedCount = contactedLast30.filter((c) => c.candidate.status !== 'APPLIED').length;
  const responseRate = contactedCount > 0 ? Math.round((respondedCount / contactedCount) * 1000) / 10 : 0;

  return {
    emailsSentToday,
    whatsappSentToday,
    pendingScheduled,
    failedMessages: failedLast30,
    openRate,
    responseRate,
  };
}

// ── Delivery tracking (webhooks / open-tracking pixel) ──────────────────

/// Provider-independent "Opened" tracking: a 1x1 pixel embedded in the
/// email HTML hits this endpoint when the recipient's mail client loads
/// images. Works regardless of which EmailProvider is configured — unlike
/// Delivered/Bounced, which depend on the provider supporting webhooks.
export async function markMessageOpened(messageLogId: string) {
  const log = await prisma.communicationMessageLog.findUnique({ where: { id: messageLogId } });
  if (!log || log.channel !== 'EMAIL') return;
  if (log.status === 'SENT' || log.status === 'DELIVERED') {
    await prisma.communicationMessageLog.update({
      where: { id: messageLogId },
      data: { status: 'OPENED', openedAt: new Date() },
    });
    await prisma.communicationBatch
      .update({ where: { id: log.batchId }, data: { openedCount: { increment: 1 } } })
      .catch(() => undefined);
  }
}

/// Meta WhatsApp Cloud API delivery callback handler — matches messages by
/// the providerMessageId captured at send time.
export async function handleWhatsappStatusUpdate(
  providerMessageId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
  errorReason?: string
) {
  const log = await prisma.communicationMessageLog.findFirst({ where: { providerMessageId } });
  if (!log) return;

  const statusMap = { sent: 'SENT', delivered: 'DELIVERED', read: 'OPENED', failed: 'FAILED' } as const;
  const newStatus = statusMap[status];
  if (!newStatus || newStatus === log.status) return;

  const data: Prisma.CommunicationMessageLogUpdateInput = { status: newStatus };
  if (newStatus === 'DELIVERED') data.deliveredAt = new Date();
  if (newStatus === 'OPENED') data.openedAt = new Date();
  if (newStatus === 'FAILED') {
    data.failedAt = new Date();
    data.errorReason = errorReason ?? log.errorReason;
  }

  await prisma.communicationMessageLog.update({ where: { id: log.id }, data });

  const countField = { DELIVERED: 'deliveredCount', OPENED: 'openedCount', FAILED: 'failedCount' } as const;
  const field = countField[newStatus as keyof typeof countField];
  if (field) {
    await prisma.communicationBatch.update({ where: { id: log.batchId }, data: { [field]: { increment: 1 } } }).catch(() => undefined);
  }
}

export const communicationConfig = {
  emailConfigured: Boolean(env.smtp.host && env.smtp.user && env.smtp.password),
  whatsappConfigured: Boolean(env.whatsapp.phoneNumberId && env.whatsapp.accessToken),
};
