import { z } from 'zod';
import { CommChannel } from '@prisma/client';

const attachmentSchema = z.object({
  filename: z.string().trim().min(1),
  url: z.string().trim().min(1),
});

export const createTemplateSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Template name is required'),
    channel: z.nativeEnum(CommChannel),
    category: z.string().trim().optional(),
    subject: z.string().trim().optional(),
    body: z.string().trim().min(1, 'Template body is required'),
  }),
});

export const updateTemplateSchema = z.object({
  body: createTemplateSchema.shape.body.partial(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

const variablesSchema = z.record(z.string(), z.string()).optional();

export const sendBulkSchema = z.object({
  body: z.object({
    channel: z.nativeEnum(CommChannel),
    candidateIds: z.array(z.string().uuid()).min(1, 'Select at least one candidate'),
    templateId: z.string().uuid().optional().nullable(),
    subject: z.string().trim().optional(),
    body: z.string().trim().min(1, 'Message body is required'),
    attachments: z.array(attachmentSchema).max(10).optional(),
    scheduledAt: z.coerce.date().optional().nullable(),
    variables: variablesSchema,
  }),
});

export const sendTestSchema = z.object({
  body: z.object({
    channel: z.nativeEnum(CommChannel),
    subject: z.string().trim().optional(),
    body: z.string().trim().min(1, 'Message body is required'),
    testRecipient: z.string().trim().min(3, 'A test recipient is required'),
    variables: variablesSchema,
  }),
});

export const candidateIdParamSchema = z.object({ params: z.object({ candidateId: z.string().uuid() }) });
