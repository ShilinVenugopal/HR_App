import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import { prisma } from '../../config/database';

export const listAuditLogsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');

  const where: Prisma.AuditLogWhereInput = {
    ...(req.query.userId ? { userId: req.query.userId as string } : {}),
    ...(req.query.action ? { action: req.query.action as any } : {}),
    ...(req.query.module ? { module: req.query.module as any } : {}),
    ...(req.query.projectId ? { projectId: req.query.projectId as string } : {}),
    ...(req.query.status ? { status: req.query.status as any } : {}),
    ...(req.query.dateFrom || req.query.dateTo
      ? {
          createdAt: {
            ...(req.query.dateFrom ? { gte: new Date(req.query.dateFrom as string) } : {}),
            ...(req.query.dateTo ? { lte: new Date(req.query.dateTo as string) } : {}),
          },
        }
      : {}),
    ...(pagination.search
      ? {
          OR: [
            { userEmail: { contains: pagination.search, mode: 'insensitive' } },
            { ipAddress: { contains: pagination.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, projectName: true } },
      },
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { createdAt: pagination.sortOrder },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return sendSuccess(res, rows, 'Audit logs fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});
