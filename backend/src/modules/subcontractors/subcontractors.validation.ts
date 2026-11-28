import { z } from 'zod';
import { ContractingType, MSMEType } from '@prisma/client';

const subcontractorBodySchema = z
  .object({
    companyName: z.string().trim().min(2, 'Company Name is mandatory'),
    contactPerson: z.string().trim().optional(),
    address: z.string().trim().optional(),
    gstNumber: z.string().trim().optional(),
    panNumber: z.string().trim().optional(),
    msmeAvailable: z.boolean().default(false),
    msmeNumber: z.string().trim().optional(),
    msmeType: z.nativeEnum(MSMEType).optional(),
    contactNumber: z.string().trim().min(1, 'Contact Number is mandatory'),
    email: z.string().trim().email().optional().or(z.literal('')),
    bankAccountNumber: z.string().trim().min(1, 'Bank Account Number is mandatory'),
    bankName: z.string().trim().min(1, 'Bank Name is mandatory'),
    ifscCode: z.string().trim().min(1, 'IFSC Code is mandatory'),
    contractingType: z.nativeEnum(ContractingType),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  })
  // MSME Number/Type are only meaningful (and required) when MSME Available
  // is Yes — mirrors the frontend's conditional field display exactly.
  .refine((v) => !v.msmeAvailable || Boolean(v.msmeNumber?.trim()), {
    message: 'MSME Number is required when MSME Available is Yes',
    path: ['msmeNumber'],
  })
  .refine((v) => !v.msmeAvailable || Boolean(v.msmeType), {
    message: 'MSME Type is required when MSME Available is Yes',
    path: ['msmeType'],
  });

export const createSubcontractorSchema = z.object({ body: subcontractorBodySchema });

/// `.partial()` on the already-refined schema loses the refinements (Zod
/// can't partial() a ZodEffects), so update re-applies the same two MSME
/// conditional checks against the merged (existing + incoming) shape at the
/// service layer instead — see subcontractors.service.ts.
export const updateSubcontractorSchema = z.object({
  body: z
    .object({
      companyName: z.string().trim().min(2, 'Company Name is mandatory').optional(),
      contactPerson: z.string().trim().optional(),
      address: z.string().trim().optional(),
      gstNumber: z.string().trim().optional(),
      panNumber: z.string().trim().optional(),
      msmeAvailable: z.boolean().optional(),
      msmeNumber: z.string().trim().optional().nullable(),
      msmeType: z.nativeEnum(MSMEType).optional().nullable(),
      contactNumber: z.string().trim().min(1, 'Contact Number is mandatory').optional(),
      email: z.string().trim().email().optional().or(z.literal('')),
      bankAccountNumber: z.string().trim().min(1, 'Bank Account Number is mandatory').optional(),
      bankName: z.string().trim().min(1, 'Bank Name is mandatory').optional(),
      ifscCode: z.string().trim().min(1, 'IFSC Code is mandatory').optional(),
      contractingType: z.nativeEnum(ContractingType).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
