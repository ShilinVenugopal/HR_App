import { z } from 'zod';
import { AdvanceType } from '@prisma/client';

export const createAdvanceSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid('Employee is required'),
    type: z.nativeEnum(AdvanceType).default(AdvanceType.ADVANCE),
    amount: z.coerce.number().positive('Amount must be greater than zero'),
    reason: z.string().trim().optional(),
    installments: z.coerce.number().int().min(1).default(1),
  }),
});

export const updateAdvanceSchema = z.object({
  body: z.object({
    reason: z.string().trim().optional(),
    installments: z.coerce.number().int().min(1).optional(),
    amount: z.coerce.number().positive().optional(),
  }),
});

export const recoverySchema = z.object({
  body: z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
    amount: z.coerce.number().positive('Recovery amount must be greater than zero'),
  }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
