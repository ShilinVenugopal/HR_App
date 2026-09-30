import { z } from 'zod';
import { SiteAccountEntryType } from '@prisma/client';

const entrySchema = z
  .object({
    entryType: z.nativeEnum(SiteAccountEntryType),
    costCodeId: z.string().uuid().optional(),
    voucherNo: z.string().trim().optional(),
    particulars: z.string().trim().optional(),
    dates: z.array(z.coerce.date()).optional(),
    receiptAmount: z.coerce.number().nonnegative('Receipt amount cannot be negative').default(0),
    depositAdvanceAmount: z.coerce.number().nonnegative('Deposit/Advance amount cannot be negative').default(0),
    paymentAmount: z.coerce.number().nonnegative('Payment amount cannot be negative').default(0),
  })
  .refine((v) => (v.entryType === 'EXPENSE' ? Boolean(v.costCodeId) : true), {
    message: 'A cost code is required for an expense entry',
    path: ['costCodeId'],
  })
  .refine((v) => (v.entryType === 'OTHER_RECEIPT' ? Boolean(v.particulars) : true), {
    message: 'Particulars are required for a receipt/deposit entry',
    path: ['particulars'],
  })
  .refine((v) => (v.entryType === 'EXPENSE' ? v.paymentAmount > 0 : true), {
    message: 'Payment amount must be greater than 0',
    path: ['paymentAmount'],
  })
  .refine((v) => (v.entryType === 'OTHER_RECEIPT' ? v.receiptAmount > 0 || v.depositAdvanceAmount > 0 : true), {
    message: 'Enter a receipt or deposit/advance amount',
    path: ['receiptAmount'],
  });

export const createStatementSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Project is required'),
    statementDate: z.coerce.date(),
    periodFrom: z.coerce.date(),
    periodTo: z.coerce.date(),
    openingBalance: z.coerce.number().nonnegative('Opening Balance cannot be negative').default(0),
    siteFundReceived: z.coerce.number().nonnegative('Site Fund Received cannot be negative').default(0),
    entries: z.array(entrySchema).default([]),
  }),
});

/// Project is never editable after creation — same reasoning as every
/// other project-scoped document in this app.
export const updateStatementSchema = z.object({
  body: createStatementSchema.shape.body.omit({ projectId: true }).partial(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
