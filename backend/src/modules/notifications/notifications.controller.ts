import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as notificationsService from './notifications.service';

export const listNotificationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const unreadOnly = req.query.unreadOnly === 'true';
  const { rows, total, unreadCount } = await notificationsService.listNotifications(req, pagination, unreadOnly);
  return sendSuccess(res, { rows, unreadCount }, 'Notifications fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const markNotificationReadHandler = asyncHandler(async (req: Request, res: Response) => {
  const notification = await notificationsService.markNotificationRead(req, req.params.id);
  return sendSuccess(res, notification, 'Notification marked as read');
});

export const markAllNotificationsReadHandler = asyncHandler(async (req: Request, res: Response) => {
  await notificationsService.markAllNotificationsRead(req);
  return sendSuccess(res, null, 'All notifications marked as read');
});
