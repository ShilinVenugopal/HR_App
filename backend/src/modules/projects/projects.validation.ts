import { z } from 'zod';
import { ProjectStatus } from '@prisma/client';

export const createProjectSchema = z.object({
  body: z.object({
    projectName: z.string().trim().min(2, 'Project name is required'),
    clientName: z.string().trim().min(2, 'Client name is required'),
    location: z.string().trim().optional(),
    status: z.nativeEnum(ProjectStatus).default(ProjectStatus.ACTIVE),
  }),
});

export const updateProjectSchema = z.object({
  body: z.object({
    projectName: z.string().trim().min(2).optional(),
    clientName: z.string().trim().min(2).optional(),
    location: z.string().trim().optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});
