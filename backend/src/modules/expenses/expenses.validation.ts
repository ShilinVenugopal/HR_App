import { z } from 'zod';
import { Unit } from '@prisma/client';

/// Every monetary field is optional and defaults to 0 (per the design
/// brief — only Manpower and Total Manpower Net Salary are mandatory).
/// `totalAmount` is deliberately absent from this schema: it is always
/// server-computed (see expenses.service.ts computeTotalAmount) and can
/// never be set from client input.
const amountField = () => z.coerce.number().nonnegative('Amount cannot be negative').default(0);

export const createExpenseSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Project is required'),
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
    uom: z.nativeEnum(Unit).optional(),
    manpower: z.coerce.number().nonnegative('Manpower must be a valid non-negative number'),
    basicSalary: amountField(),
    totalManpowerNetSalary: z.coerce.number().nonnegative('Total manpower Net Salary must be a valid non-negative number'),
    leavePay: amountField(),
    bonus: amountField(),
    pf: amountField(),
    esic: amountField(),
    transportation: amountField(),
    accommodation: amountField(),
    operationalCost: amountField(),
    labLicenseBgFund: amountField(),
    ppe: amountField(),
    coverall: amountField(),
    medicalExpense: amountField(),
    toolsAndMachinery: amountField(),
    mobDemobCost: amountField(),
    insurance: amountField(),
    consumables: amountField(),
    misc: amountField(),
  }),
});

/// Project + Year + Month identify the record and are never editable
/// after creation — same "identity fields are locked post-creation" rule
/// PurchaseOrder's projectId and BillingRecord's month/year follow.
export const updateExpenseSchema = z.object({
  body: createExpenseSchema.shape.body.omit({ projectId: true, year: true, month: true }).partial().extend({
    manpower: z.coerce.number().nonnegative('Manpower must be a valid non-negative number').optional(),
    totalManpowerNetSalary: z.coerce.number().nonnegative('Total manpower Net Salary must be a valid non-negative number').optional(),
  }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

export const lookupQuerySchema = z.object({
  query: z.object({
    projectId: z.string().uuid('Project is required'),
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
  }),
});
