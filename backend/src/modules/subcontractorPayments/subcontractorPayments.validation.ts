import { z } from 'zod';
import { AdditionalAmountType, SubcontractorPaymentStatus, TdsCalculationMode } from '@prisma/client';

export const createSubcontractorBillSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Project is required'),
    subcontractorId: z.string().uuid('Subcontractor is required'),
    billingMonth: z.coerce.number().int().min(1).max(12),
    billingYear: z.coerce.number().int().min(2000).max(2100),
    invoiceNumber: z.string().trim().min(1, 'Invoice Number is required'),
    invoiceDate: z.coerce.date({ required_error: 'Invoice Date is required', invalid_type_error: 'Invoice Date is required' }),
    foraysWoNumber: z.string().trim().optional(),
    basicAmount: z.coerce.number().nonnegative('Basic Amount cannot be negative'),
    additionalAmount: z.coerce.number().nonnegative('Additional Amount cannot be negative').default(0),
    additionalAmountType: z.nativeEnum(AdditionalAmountType).optional(),
    gstAmount: z.coerce.number().nonnegative('GST Amount cannot be negative').default(0),
    tdsPercentage: z.coerce.number().int().min(1).max(10).optional(),
    tdsAmount: z.coerce.number().nonnegative('TDS Amount cannot be negative').default(0),
    tdsCalculationMode: z.nativeEnum(TdsCalculationMode).default('AUTO'),
    tollAmount: z.coerce.number().nonnegative('Toll Amount cannot be negative').default(0),
    remarks: z.string().trim().optional(),
  }),
});

export const updateSubcontractorBillSchema = z.object({
  body: z
    .object({
      projectId: z.string().uuid().optional(),
      subcontractorId: z.string().uuid().optional(),
      billingMonth: z.coerce.number().int().min(1).max(12).optional(),
      billingYear: z.coerce.number().int().min(2000).max(2100).optional(),
      invoiceNumber: z.string().trim().min(1, 'Invoice Number is required').optional(),
      invoiceDate: z.coerce.date().optional(),
      foraysWoNumber: z.string().trim().optional().nullable(),
      basicAmount: z.coerce.number().nonnegative('Basic Amount cannot be negative').optional(),
      additionalAmount: z.coerce.number().nonnegative('Additional Amount cannot be negative').optional(),
      additionalAmountType: z.nativeEnum(AdditionalAmountType).optional().nullable(),
      gstAmount: z.coerce.number().nonnegative('GST Amount cannot be negative').optional(),
      tdsPercentage: z.coerce.number().int().min(1).max(10).optional().nullable(),
      tdsAmount: z.coerce.number().nonnegative('TDS Amount cannot be negative').optional(),
      tdsCalculationMode: z.nativeEnum(TdsCalculationMode).optional(),
      tollAmount: z.coerce.number().nonnegative('Toll Amount cannot be negative').optional(),
      remarks: z.string().trim().optional().nullable(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
export const paymentIdParamSchema = z.object({ params: z.object({ paymentId: z.string().uuid() }) });

export const createPaymentTransactionSchema = z.object({
  body: z
    .object({
      paymentDate: z.coerce.date({ required_error: 'Payment Processing Date is required', invalid_type_error: 'Payment Processing Date is required' }),
      amountProcessed: z.coerce.number().nonnegative('Amount Processed cannot be negative').default(0),
      gstAmountProcessed: z.coerce.number().nonnegative('GST Amount Processed cannot be negative').default(0),
      tdsAmountDeducted: z.coerce.number().nonnegative('TDS Amount Deducted cannot be negative').default(0),
      paymentReference: z.string().trim().optional(),
      remarks: z.string().trim().optional(),
      status: z.nativeEnum(SubcontractorPaymentStatus).default('PROCESSED'),
    })
    .refine((v) => v.amountProcessed > 0 || v.gstAmountProcessed > 0 || v.tdsAmountDeducted > 0, {
      message: 'Enter at least one of Amount Processed, GST Amount Processed or TDS Amount Deducted',
      path: ['amountProcessed'],
    }),
});

export const updatePaymentTransactionSchema = z.object({
  body: z
    .object({
      paymentDate: z.coerce.date().optional(),
      amountProcessed: z.coerce.number().nonnegative('Amount Processed cannot be negative').optional(),
      gstAmountProcessed: z.coerce.number().nonnegative('GST Amount Processed cannot be negative').optional(),
      tdsAmountDeducted: z.coerce.number().nonnegative('TDS Amount Deducted cannot be negative').optional(),
      paymentReference: z.string().trim().optional().nullable(),
      remarks: z.string().trim().optional().nullable(),
      status: z.nativeEnum(SubcontractorPaymentStatus).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' }),
});
