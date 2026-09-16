import { z } from 'zod';
import { Unit } from '@prisma/client';

const grnItemSchema = z
  .object({
    costCodeId: z.string().uuid().optional(),
    description: z.string().trim().min(1, 'Description is required'),
    unit: z.nativeEnum(Unit),
    qtyAsPerChallan: z.coerce.number().min(0),
    actualQtyReceived: z.coerce.number().min(0),
    acceptedQty: z.coerce.number().min(0),
    remarks: z.string().trim().optional(),
  })
  .refine((item) => item.acceptedQty <= item.actualQtyReceived, {
    message: 'Accepted quantity cannot exceed actual quantity received',
    path: ['acceptedQty'],
  });

export const createGrnSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Project is required'),
    poId: z.string().uuid('Purchase Order is required'),
    supplierName: z.string().trim().optional(),
    receiptDate: z.coerce.date().optional(),
    challanNumber: z.string().trim().optional(),
    challanDate: z.coerce.date().optional(),
    lrNumber: z.string().trim().optional(),
    lrDate: z.coerce.date().optional(),
    transporterName: z.string().trim().optional(),
    items: z.array(grnItemSchema).min(1, 'At least one item is required'),
  }),
});

/// Project and source PO are never editable after creation — same
/// reasoning as PR/PO update schemas.
export const updateGrnSchema = z.object({
  body: createGrnSchema.shape.body
    .omit({ projectId: true, poId: true })
    .partial()
    .extend({ items: z.array(grnItemSchema).min(1, 'At least one item is required').optional() }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

export const submitGrnSchema = z.object({ body: z.object({ approverId: z.string().uuid('An approver must be selected') }) });
export const decideGrnSchema = z.object({ body: z.object({ comments: z.string().trim().optional() }) });
export const rejectOrReturnGrnSchema = z.object({ body: z.object({ comments: z.string().trim().min(1, 'Comments are required') }) });
export const approversQuerySchema = z.object({ query: z.object({ projectId: z.string().uuid('Project is required') }) });
