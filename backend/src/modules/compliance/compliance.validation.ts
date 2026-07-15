import { z } from 'zod';
import { ComplianceStatus, ComplianceType } from '@prisma/client';

export const createComplianceSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Project is required'),
    employeeId: z.string().uuid().optional().nullable(),
    type: z.nativeEnum(ComplianceType),
    referenceNumber: z.string().trim().optional(),
    validFrom: z.coerce.date().optional().nullable(),
    validTo: z.coerce.date().optional().nullable(),
    status: z.nativeEnum(ComplianceStatus).default(ComplianceStatus.ACTIVE),
    remarks: z.string().trim().optional(),
  }),
});

export const updateComplianceSchema = z.object({
  body: createComplianceSchema.shape.body.partial().omit({ projectId: true }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
