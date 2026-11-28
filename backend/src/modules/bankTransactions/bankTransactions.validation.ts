import { z } from 'zod';

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

export const updateTransactionSchema = z.object({
  body: z
    .object({
      description: z.string().trim().min(1, 'Description is required').optional(),
      remarks: z.string().trim().optional().nullable(),
      amount: z.coerce.number().nonnegative('Amount cannot be negative').optional(),
      transactionDate: z.coerce.date().optional(),
      bankAccountId: z.string().uuid().optional(),
      projectId: z.string().uuid().optional().nullable(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' }),
});

export const createManualTransactionSchema = z.object({
  body: z.object({
    transactionDate: z.coerce.date({ required_error: 'Date is required', invalid_type_error: 'Date is required' }),
    bankAccountId: z.string().uuid('Bank Account is required'),
    transactionType: z.enum(['RECEIPT', 'PAYMENT']),
    projectId: z.string().uuid().optional(),
    description: z.string().trim().min(1, 'Description is required'),
    remarks: z.string().trim().optional(),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
  }),
});

export const createTransferSchema = z.object({
  body: z.object({
    transactionDate: z.coerce.date({ required_error: 'Date is required', invalid_type_error: 'Date is required' }),
    fromAccountId: z.string().uuid('From Account is required'),
    toAccountId: z.string().uuid('To Account is required'),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    description: z.string().trim().optional(),
    remarks: z.string().trim().optional(),
  }),
});
