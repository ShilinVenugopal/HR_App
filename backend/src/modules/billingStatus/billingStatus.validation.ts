import { z } from 'zod';
import { BillingItemStatus } from '@prisma/client';

const billingItemSchema = z.object({
  plantUnit: z.string().trim().min(1, 'Plant/Unit is required'),
  invoiceNo: z.string().trim().optional(),
  jmsNo: z.string().trim().optional(),
  // Mandatory for new entries only — updateBillingItemSchema below makes it
  // optional so pre-existing rows without one can still be edited.
  invoiceDate: z.coerce.date({ required_error: 'Invoice Date is required', invalid_type_error: 'Invoice Date is required' }),
  abstractAmount: z.coerce.number().nonnegative('Abstract Amount cannot be negative'),
  taxAmount: z.coerce.number().nonnegative('Tax Amount cannot be negative').default(0),
  status: z.nativeEnum(BillingItemStatus).default('PENDING_CERTIFICATION'),
});

export const createBillingRecordSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Project is required'),
    billingMonth: z.coerce.number().int().min(1).max(12),
    billingYear: z.coerce.number().int().min(2000).max(2100),
    periodFrom: z.coerce.date().optional(),
    periodTo: z.coerce.date().optional(),
    items: z.array(billingItemSchema).min(1, 'At least one bill row is required'),
  }),
});

/// Project, month and year are never editable after creation — only the
/// period range can be corrected; item-level fields are edited per-item via
/// updateBillingItemSchema instead.
export const updateBillingRecordSchema = z.object({
  body: z.object({
    periodFrom: z.coerce.date().optional().nullable(),
    periodTo: z.coerce.date().optional().nullable(),
  }),
});

export const updateBillingItemSchema = z.object({
  body: z
    .object({
      plantUnit: z.string().trim().min(1, 'Plant/Unit is required').optional(),
      invoiceNo: z.string().trim().optional().nullable(),
      jmsNo: z.string().trim().optional().nullable(),
      // Optional on update (unlike create) so legacy rows created before
      // this field existed can still be edited without forcing a backfill.
      invoiceDate: z.coerce.date().optional(),
      abstractAmount: z.coerce.number().nonnegative('Abstract Amount cannot be negative').optional(),
      taxAmount: z.coerce.number().nonnegative('Tax Amount cannot be negative').optional(),
      status: z.nativeEnum(BillingItemStatus).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
export const itemIdParamSchema = z.object({ params: z.object({ itemId: z.string().uuid() }) });
export const paymentIdParamSchema = z.object({ params: z.object({ paymentId: z.string().uuid() }) });

export const createBillingPaymentSchema = z.object({
  body: z.object({
    amountReceived: z.coerce.number().positive('Amount Received must be greater than 0'),
    paymentDate: z.coerce.date({ required_error: 'Payment Date is required', invalid_type_error: 'Payment Date is required' }),
    remarks: z.string().trim().optional(),
  }),
});

export const updateBillingPaymentSchema = z.object({
  body: z
    .object({
      amountReceived: z.coerce.number().positive('Amount Received must be greater than 0').optional(),
      paymentDate: z.coerce.date().optional(),
      remarks: z.string().trim().optional().nullable(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' }),
});

const PAYMENT_DUE_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'] as const;
const NOTIFICATION_FIELDS = [
  'project',
  'invoiceNo',
  'invoiceDate',
  'invoiceAmount',
  'amountReceived',
  'outstandingAmount',
  'dueDate',
  'paymentStatus',
] as const;

export const updateBillingNotificationSettingsSchema = z.object({
  body: z
    .object({
      enabled: z.boolean().optional(),
      dueDays: z.coerce.number().int().min(1, 'Payment due period must be at least 1 day').max(365, 'Payment due period cannot exceed 365 days').optional(),
      visibleStatuses: z.array(z.enum(PAYMENT_DUE_STATUSES)).optional(),
      visibleFields: z.array(z.enum(NOTIFICATION_FIELDS)).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' }),
});
