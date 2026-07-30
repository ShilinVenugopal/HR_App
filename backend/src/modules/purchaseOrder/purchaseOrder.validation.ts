import { z } from 'zod';
import { Unit } from '@prisma/client';

const poItemSchema = z.object({
  costCodeId: z.string().uuid().optional(),
  description: z.string().trim().min(1, 'Description is required'),
  unit: z.nativeEnum(Unit),
  qty: z.coerce.number().min(0),
  rate: z.coerce.number().min(0),
  gstPercent: z.coerce.number().min(0).max(100).default(0),
  remarks: z.string().trim().optional(),
});

export const createPoSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Project is required'),
    prId: z.string().uuid().optional(),
    poNumber: z.string().trim().min(1, 'PO Number is required'),
    poDate: z.coerce.date().optional(),
    vendorId: z.string().uuid('Vendor is required'),
    enquiryNoDate: z.string().trim().optional(),
    quotationNo: z.string().trim().optional(),
    ref: z.string().trim().optional(),
    jobNo: z.string().trim().optional(),
    deliveryDate: z.coerce.date().optional(),
    packingForwarding: z.coerce.number().min(0).default(0),
    transportationCharges: z.coerce.number().min(0).default(0),
    taxesAndDuties: z.coerce.number().min(0).default(0),
    items: z.array(poItemSchema).min(1, 'At least one item is required'),
  }),
});

/// Project is never editable after creation — poNumber's uniqueness is
/// scoped to the project it was allocated under, same reasoning as PR.
export const updatePoSchema = z.object({
  body: createPoSchema.shape.body
    .omit({ projectId: true })
    .partial()
    .extend({ items: z.array(poItemSchema).min(1, 'At least one item is required').optional() }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

export const submitPoSchema = z.object({ body: z.object({ approverId: z.string().uuid('An approver must be selected') }) });
export const decidePoSchema = z.object({ body: z.object({ comments: z.string().trim().optional() }) });
export const rejectPoSchema = z.object({ body: z.object({ comments: z.string().trim().min(1, 'Comments are required') }) });
export const approversQuerySchema = z.object({ query: z.object({ projectId: z.string().uuid('Project is required') }) });

/// The "static yellow fields" — editable only by authorized administrators
/// per the design brief — gated to Super Admin at the route level
/// (requireSuperAdmin), separate from the regular PURCHASE_ORDER edit
/// permission that covers vendor/items/dates.
export const updatePoSettingsSchema = z.object({
  body: z.object({
    billingAddress: z.string().trim().optional(),
    billingGstNumber: z.string().trim().optional(),
    termsAndConditions: z.record(z.string()).optional(),
    signatureImageUrl: z.string().trim().optional(),
    authorizedName: z.string().trim().optional(),
    authorizedDesignation: z.string().trim().optional(),
  }),
});
