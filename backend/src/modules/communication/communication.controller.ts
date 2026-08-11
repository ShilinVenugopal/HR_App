import { Request, Response } from 'express';
import { CommChannel } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as communicationService from './communication.service';

export const listTemplatesHandler = asyncHandler(async (req: Request, res: Response) => {
  const channel = req.query.channel as CommChannel | undefined;
  const templates = await communicationService.listTemplates(channel);
  return sendSuccess(res, templates, 'Templates fetched');
});

export const createTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const template = await communicationService.createTemplate(req, req.body, req.meta);
  return sendSuccess(res, template, 'Template created successfully', 201);
});

export const updateTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const template = await communicationService.updateTemplate(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, template, 'Template updated successfully');
});

export const duplicateTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const template = await communicationService.duplicateTemplate(req, req.params.id, req.meta);
  return sendSuccess(res, template, 'Template duplicated successfully', 201);
});

export const deleteTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  await communicationService.deleteTemplate(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Template deleted successfully');
});

export const sendBulkHandler = asyncHandler(async (req: Request, res: Response) => {
  const batch = await communicationService.createBulkSend(req, req.body, req.meta);
  return sendSuccess(res, batch, req.body.scheduledAt ? 'Messages scheduled successfully' : 'Messages queued for sending', 201);
});

export const sendTestHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await communicationService.sendTestMessage(req, req.body);
  return sendSuccess(res, result, result.success ? 'Test message sent' : result.errorReason ?? 'Test message failed');
});

export const listHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const filters = {
    channel: req.query.channel as string | undefined,
    status: req.query.status as string | undefined,
    projectId: req.query.projectId as string | undefined,
    templateId: req.query.templateId as string | undefined,
    recruiterId: req.query.recruiterId as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
  };
  const { rows, total } = await communicationService.listHistory(req, pagination, filters);
  return sendSuccess(res, rows, 'Communication history fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getCandidateTimelineHandler = asyncHandler(async (req: Request, res: Response) => {
  const timeline = await communicationService.getCandidateTimeline(req, req.params.candidateId);
  return sendSuccess(res, timeline, 'Candidate communication timeline fetched');
});

export const resendHandler = asyncHandler(async (req: Request, res: Response) => {
  const updated = await communicationService.resendMessage(req, req.params.id, req.meta);
  return sendSuccess(res, updated, 'Message re-queued for sending');
});

export const deleteHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  await communicationService.deleteMessage(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Message deleted successfully');
});

export const getStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  const stats = await communicationService.getCommunicationStats(req);
  return sendSuccess(res, stats, 'Communication stats fetched');
});

export const getConfigHandler = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, communicationService.communicationConfig, 'Communication provider config fetched');
});

// 1x1 transparent GIF, served regardless of outcome so the pixel request
// never errors visibly in the recipient's mail client.
const TRACKING_PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7', 'base64');

export const trackOpenHandler = asyncHandler(async (req: Request, res: Response) => {
  await communicationService.markMessageOpened(req.params.id).catch(() => undefined);
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store');
  return res.status(200).send(TRACKING_PIXEL);
});

// ── Meta WhatsApp Cloud API webhook ─────────────────────────────────────
// Built to Meta's documented shape (https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks).
// Untestable end-to-end without a public HTTPS URL + a real WABA, but the
// verify handshake and status-callback parsing are implemented correctly.

export const whatsappWebhookVerifyHandler = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

export const whatsappWebhookEventHandler = asyncHandler(async (req: Request, res: Response) => {
  // Acknowledge immediately — Meta retries aggressively on non-2xx.
  res.sendStatus(200);

  const entries = req.body?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        const mapped = ['sent', 'delivered', 'read', 'failed'].includes(status.status) ? status.status : undefined;
        if (mapped) {
          await communicationService
            .handleWhatsappStatusUpdate(status.id, mapped, status.errors?.[0]?.title)
            .catch(() => undefined);
        }
      }
    }
  }
});
