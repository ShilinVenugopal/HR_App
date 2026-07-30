import { NotificationType, ProcurementDocType } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';

/// Every "automatically notify X" requirement in the design brief funnels
/// through this one function — a DASHBOARD-channel row the recipient sees
/// in the notification bell. Email/WhatsApp channels are declared in the
/// schema for future use but nothing in this sandbox sends real email/
/// WhatsApp (no SMTP/Meta credentials configured anywhere, same honest
/// limitation as the Bulk Communication module).
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  documentType?: ProcurementDocType;
  documentId?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      documentType: params.documentType,
      documentId: params.documentId,
      channel: 'DASHBOARD',
    },
  });
}

export async function listNotifications(req: Request, pagination: PaginationParams, unreadOnly?: boolean) {
  const where = { userId: req.user!.sub, ...(unreadOnly ? { isRead: false } : {}) };

  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.user!.sub, isRead: false } }),
  ]);

  return { rows, total, unreadCount };
}

export async function markNotificationRead(req: Request, id: string) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== req.user!.sub) throw ApiError.notFound('Notification not found');

  return prisma.notification.update({ where: { id }, data: { isRead: true } });
}

export async function markAllNotificationsRead(req: Request) {
  await prisma.notification.updateMany({ where: { userId: req.user!.sub, isRead: false }, data: { isRead: true } });
}
