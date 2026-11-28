import { z } from 'zod';
import { Unit } from '@prisma/client';

export const createAssetSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Project is required'),
    costCodeId: z.string().uuid('Cost Code is required'),
    itemDescription: z.string().trim().min(2, 'Item Description is required'),
    unit: z.nativeEnum(Unit),
    workingQuantity: z.coerce.number().min(0, 'Working Quantity must be 0 or more'),
    nonWorkingQuantity: z.coerce.number().min(0, 'Non-working Quantity must be 0 or more'),
    remarks: z.string().trim().optional(),
    date: z.coerce.date({ required_error: 'Date is required', invalid_type_error: 'Date is required' }),
  }),
});

export const updateAssetSchema = z.object({
  body: createAssetSchema.shape.body.partial(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

const bulkAssetRowSchema = z.object({
  rowNumber: z.number(),
  projectId: z.string().uuid(),
  costCodeId: z.string().uuid(),
  itemDescription: z.string().trim().min(1),
  unit: z.nativeEnum(Unit),
  workingQuantity: z.coerce.number().min(0),
  nonWorkingQuantity: z.coerce.number().min(0),
  remarks: z.string().trim().optional().nullable(),
  date: z.coerce.date(),
});
export type BulkAssetRow = z.infer<typeof bulkAssetRowSchema>;

export const bulkImportSchema = z.object({
  body: z.object({
    rows: z.array(bulkAssetRowSchema).min(1),
  }),
});
