import { z } from 'zod';
import { Unit } from '@prisma/client';

const prItemSchema = z.object({
  costCodeId: z.string().uuid('Cost Code is required'),
  materialName: z.string().trim().min(1, 'Material Name is required'),
  unit: z.nativeEnum(Unit),
  totalReqQty: z.coerce.number().min(0),
  make: z.string().trim().optional(),
  modelNo: z.string().trim().optional(),
  qtyAvailableAtSite: z.coerce.number().min(0).default(0),
  remarks: z.string().trim().optional(),
});

export const createPrSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Project is required'),
    prNumber: z.string().trim().optional(),
    departmentId: z.string().uuid().optional(),
    siteInchargeName: z.string().trim().optional(),
    storeInchargeName: z.string().trim().optional(),
    items: z.array(prItemSchema).min(1, 'At least one item is required'),
  }),
});

/// Project is never editable after creation — requestNumber's sequence is
/// scoped to the project it was allocated under, and reassigning a PR to
/// a different project mid-flight would orphan that numbering.
export const updatePrSchema = z.object({
  body: createPrSchema.shape.body
    .omit({ projectId: true })
    .partial()
    .extend({ items: z.array(prItemSchema).min(1, 'At least one item is required').optional() }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

export const submitPrSchema = z.object({
  body: z.object({ approverId: z.string().uuid('An approver must be selected') }),
});

export const decidePrSchema = z.object({
  body: z.object({ comments: z.string().trim().optional() }),
});

export const rejectOrReturnPrSchema = z.object({
  body: z.object({ comments: z.string().trim().min(1, 'Comments are required') }),
});

export const approversQuerySchema = z.object({
  query: z.object({ projectId: z.string().uuid('Project is required') }),
});
