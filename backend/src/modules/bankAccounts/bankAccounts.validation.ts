import { z } from 'zod';
import { BankAccountStatus, BankAccountType } from '@prisma/client';

export const createBankAccountSchema = z.object({
  body: z.object({
    bankName: z.string().trim().min(1, 'Bank Name is mandatory'),
    accountHolderName: z.string().trim().min(1, 'Account Holder Name is mandatory'),
    accountType: z.nativeEnum(BankAccountType),
    accountNumber: z.string().trim().min(1, 'Account Number is mandatory'),
    branchName: z.string().trim().optional(),
    ifscCode: z.string().trim().optional(),
    openingBalance: z.coerce.number().default(0),
    openingBalanceDate: z.coerce.date({ required_error: 'Opening Balance Date is required', invalid_type_error: 'Opening Balance Date is required' }),
    status: z.nativeEnum(BankAccountStatus).default('ACTIVE'),
  }),
});

export const updateBankAccountSchema = z.object({
  body: z
    .object({
      bankName: z.string().trim().min(1, 'Bank Name is mandatory').optional(),
      accountHolderName: z.string().trim().min(1, 'Account Holder Name is mandatory').optional(),
      accountType: z.nativeEnum(BankAccountType).optional(),
      accountNumber: z.string().trim().min(1, 'Account Number is mandatory').optional(),
      branchName: z.string().trim().optional().nullable(),
      ifscCode: z.string().trim().optional().nullable(),
      openingBalance: z.coerce.number().optional(),
      openingBalanceDate: z.coerce.date().optional(),
      status: z.nativeEnum(BankAccountStatus).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
