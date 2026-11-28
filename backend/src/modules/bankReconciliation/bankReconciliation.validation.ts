import { z } from 'zod';

const bankAccountSelector = z.string().refine((v) => v === 'BOTH' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), {
  message: 'Select a valid bank account or "BOTH"',
});

export const generateStatementSchema = z.object({
  body: z.object({
    bankAccountId: bankAccountSelector,
    periodFrom: z.coerce.date({ required_error: 'Date From is required', invalid_type_error: 'Date From is required' }),
    periodTo: z.coerce.date({ required_error: 'Date To is required', invalid_type_error: 'Date To is required' }),
  }),
});

export const saveReconciliationSchema = z.object({
  body: z.object({
    bankAccountId: bankAccountSelector,
    periodFrom: z.coerce.date({ required_error: 'Date From is required', invalid_type_error: 'Date From is required' }),
    periodTo: z.coerce.date({ required_error: 'Date To is required', invalid_type_error: 'Date To is required' }),
    bankStatementBalance: z.coerce.number({ required_error: 'Bank Statement Closing Balance is required' }),
    bankStatementDate: z.coerce.date().optional(),
    bankStatementRemarks: z.string().trim().optional(),
    remarks: z.string().trim().optional(),
  }),
});
