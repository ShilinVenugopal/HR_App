import { z } from 'zod';

export const createWageSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid('Employee is required'),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
    presentDays: z.coerce.number().min(0).max(31).default(0),
    overtimeHours: z.coerce.number().min(0).default(0),
    basicWage: z.coerce.number().min(0).default(0),
    allowances: z.coerce.number().min(0).default(0),
    overtimeAmount: z.coerce.number().min(0).default(0),
    pfDeduction: z.coerce.number().min(0).default(0),
    esicDeduction: z.coerce.number().min(0).default(0),
    advanceRecovery: z.coerce.number().min(0).default(0),
    otherDeductions: z.coerce.number().min(0).default(0),
  }),
});

export const updateWageSchema = z.object({
  body: createWageSchema.shape.body.partial().omit({ employeeId: true, month: true, year: true }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
