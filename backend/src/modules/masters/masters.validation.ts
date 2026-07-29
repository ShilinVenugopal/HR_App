import { z } from 'zod';
import { ProjectStatus } from '@prisma/client';

export const createMasterSchema = z.object({
  body: z.object({
    // Only meaningful for the Cost Codes resource — Departments and
    // Designations ignore it (masters.service.ts only persists it when
    // entity === 'costCode').
    code: z.string().trim().min(1).optional(),
    name: z.string().trim().min(2, 'Name is required'),
    status: z.nativeEnum(ProjectStatus).default(ProjectStatus.ACTIVE),
  }),
});

export const updateMasterSchema = z.object({
  body: z.object({
    code: z.string().trim().min(1).optional(),
    name: z.string().trim().min(2).optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});
