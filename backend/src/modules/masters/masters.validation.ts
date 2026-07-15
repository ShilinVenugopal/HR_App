import { z } from 'zod';
import { ProjectStatus } from '@prisma/client';

export const createMasterSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name is required'),
    status: z.nativeEnum(ProjectStatus).default(ProjectStatus.ACTIVE),
  }),
});

export const updateMasterSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});
