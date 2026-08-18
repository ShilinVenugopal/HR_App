import { z } from 'zod';
import { ModuleName, TicketPriority, TicketStatus } from '@prisma/client';

export const createTicketSchema = z.object({
  body: z.object({
    module: z.nativeEnum(ModuleName).optional().nullable(),
    categoryId: z.string().uuid('Category is required'),
    subject: z.string().trim().min(3, 'Subject is required'),
    description: z.string().trim().min(3, 'Description is required'),
    priority: z.nativeEnum(TicketPriority),
    assigneeIds: z.array(z.string().uuid()).min(1, 'At least one assignee is required'),
  }),
});

export const listTicketsSchema = z.object({
  query: z.object({
    scope: z.enum(['mine', 'assigned', 'all']).optional(),
    status: z.nativeEnum(TicketStatus).optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
    categoryId: z.string().uuid().optional(),
    raisedById: z.string().uuid().optional(),
    assignedToId: z.string().uuid().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const addCommentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    comment: z.string().trim().min(1, 'Comment cannot be empty'),
  }),
});

export const changeStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.nativeEnum(TicketStatus),
  }),
});

export const changePrioritySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    priority: z.nativeEnum(TicketPriority),
  }),
});

export const manageAssigneesSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    assigneeIds: z.array(z.string().uuid()).min(1, 'At least one assignee is required'),
  }),
});

export const attachFileSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    commentId: z.string().uuid().optional().nullable(),
    fileName: z.string().trim().min(1),
    filePath: z.string().trim().min(1),
    fileSize: z.number().int().positive(),
    mimeType: z.string().trim().optional().nullable(),
  }),
});
