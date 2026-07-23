import path from 'path';
import { CommMessageStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { emailProvider } from '../providers/email.provider';
import { whatsappProvider } from '../providers/whatsapp.provider';
import { ProviderAttachment } from '../providers/types';
import { UPLOAD_ROOT } from '../utils/upload';

type BatchAttachment = { filename: string; url: string };

function readAttachments(raw: Prisma.JsonValue | null): BatchAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw as unknown as BatchAttachment[];
}

/// SMTP attaches straight from local disk (our own /uploads dir) — no
/// point looping back over HTTP to ourselves. WhatsApp's Cloud API fetches
/// media from a URL its servers can reach, so that one needs an absolute
/// external URL instead.
function forEmail(attachments: BatchAttachment[]): ProviderAttachment[] {
  return attachments.map((a) => ({
    filename: a.filename,
    url: a.url.startsWith('/uploads/') ? path.join(UPLOAD_ROOT, a.url.replace('/uploads/', '')) : a.url,
  }));
}

function forWhatsapp(attachments: BatchAttachment[]): ProviderAttachment[] {
  return attachments.map((a) => ({
    filename: a.filename,
    url: a.url.startsWith('http') ? a.url : `${env.appBaseUrl}${a.url}`,
  }));
}

function trackingPixel(messageLogId: string): string {
  return `<img src="${env.appBaseUrl}${env.apiPrefix}/track/open/${messageLogId}" width="1" height="1" style="display:none" alt="" />`;
}

async function processOne(log: {
  id: string;
  batchId: string;
  channel: 'EMAIL' | 'WHATSAPP';
  recipientEmail: string | null;
  recipientPhone: string | null;
  subject: string | null;
  body: string;
  attempts: number;
  scheduledAt: Date | null;
  batch: { attachments: Prisma.JsonValue | null };
}) {
  await prisma.communicationMessageLog.update({ where: { id: log.id }, data: { status: 'SENDING' } });

  const attachments = readAttachments(log.batch.attachments);
  const result =
    log.channel === 'EMAIL'
      ? await emailProvider.send({
          to: log.recipientEmail ?? '',
          subject: log.subject ?? '(No subject)',
          html: `${log.body}${trackingPixel(log.id)}`,
          attachments: forEmail(attachments),
        })
      : await whatsappProvider.send({
          to: log.recipientPhone ?? '',
          body: log.body,
          attachments: forWhatsapp(attachments),
        });

  const attempts = log.attempts + 1;

  if (result.success) {
    await prisma.communicationMessageLog.update({
      where: { id: log.id },
      data: { status: 'SENT', sentAt: new Date(), providerMessageId: result.providerMessageId, attempts, errorReason: null },
    });
    return;
  }

  const terminal = attempts >= env.communicationQueue.maxAttempts;
  await prisma.communicationMessageLog.update({
    where: { id: log.id },
    data: {
      status: terminal ? 'FAILED' : 'QUEUED',
      attempts,
      errorReason: result.errorReason,
      failedAt: terminal ? new Date() : null,
      // Simple linear backoff between retries — not scheduled far enough
      // out to matter for the spec's "retry failed jobs" requirement at
      // this scale, just enough to avoid hammering a provider that's down.
      scheduledAt: terminal ? log.scheduledAt : new Date(Date.now() + attempts * 60_000),
    },
  });
}

async function recomputeBatch(batchId: string) {
  const grouped = await prisma.communicationMessageLog.groupBy({
    by: ['status'],
    where: { batchId },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Record<CommMessageStatus, number>;

  const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
  const sentCount = (counts.SENT ?? 0) + (counts.DELIVERED ?? 0) + (counts.OPENED ?? 0);
  const failedTotal = (counts.FAILED ?? 0) + (counts.BOUNCED ?? 0);
  const remaining = (counts.QUEUED ?? 0) + (counts.SENDING ?? 0);
  const status = remaining > 0 ? 'SENDING' : failedTotal === total ? 'FAILED' : 'COMPLETED';

  await prisma.communicationBatch.update({
    where: { id: batchId },
    data: {
      sentCount,
      deliveredCount: counts.DELIVERED ?? 0,
      openedCount: counts.OPENED ?? 0,
      failedCount: counts.FAILED ?? 0,
      bouncedCount: counts.BOUNCED ?? 0,
      status,
    },
  });
}

async function tick() {
  const due = await prisma.communicationMessageLog.findMany({
    where: {
      status: 'QUEUED',
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    },
    include: { batch: { select: { attachments: true } } },
    take: env.communicationQueue.batchSize,
    orderBy: { createdAt: 'asc' },
  });

  if (!due.length) return;

  for (const log of due) {
    // eslint-disable-next-line no-await-in-loop
    await processOne(log).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[communicationWorker] failed to process message log ${log.id}`, err);
    });
  }

  const batchIds = Array.from(new Set(due.map((d) => d.batchId)));
  await Promise.all(batchIds.map(recomputeBatch));
}

let started = false;

/// In-process, DB-backed queue worker — no Redis/BullMQ dependency. Polls
/// for due CommunicationMessageLog rows on an interval and dispatches them
/// through the configured provider, with capped retries. Sufficient for
/// the "5000+ emails / 1000+ WhatsApp, with retries" requirement at this
/// scale; a dedicated queue (BullMQ+Redis) would be the next step if
/// throughput or multi-instance coordination ever becomes a bottleneck.
export function startCommunicationWorker() {
  if (started) return;
  started = true;

  const loop = () => {
    tick()
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[communicationWorker] tick failed', err);
      })
      .finally(() => {
        setTimeout(loop, env.communicationQueue.pollIntervalMs);
      });
  };

  setTimeout(loop, env.communicationQueue.pollIntervalMs);
}
