import { z } from 'zod';
import { Unit } from '@prisma/client';

export const createInventorySchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Project is required'),
    costCodeId: z.string().uuid('Cost Code is required'),
    itemDescription: z.string().trim().min(2, 'Item Description is required'),
    unit: z.nativeEnum(Unit),
    // In-stock Qty is mandatory — no default, so an omitted value fails validation.
    inStockQuantity: z.coerce.number().min(0, 'In-stock Qty is required'),
    consumedQuantity: z.coerce.number().min(0).default(0),
    remarks: z.string().trim().optional(),
    // Last Date of Consumption Update — optional; there may be no consumption yet.
    lastConsumptionUpdateAt: z.coerce.date().optional().nullable(),
  }),
});

export const updateInventorySchema = z.object({
  body: createInventorySchema.shape.body.partial(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

export const checkDuplicatesSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          projectId: z.string().uuid(),
          costCodeId: z.string().uuid(),
          itemDescription: z.string().trim().min(1),
        })
      )
      .min(1),
  }),
});

const bulkInventoryRowSchema = z.object({
  rowNumber: z.number(),
  projectId: z.string().uuid(),
  costCodeId: z.string().uuid(),
  itemDescription: z.string().trim().min(1),
  unit: z.nativeEnum(Unit),
  inStockQuantity: z.coerce.number().min(0).default(0),
  consumedQuantity: z.coerce.number().min(0).default(0),
  remarks: z.string().trim().optional().nullable(),
  lastConsumptionUpdateAt: z.coerce.date().optional().nullable(),
});
export type BulkInventoryRow = z.infer<typeof bulkInventoryRowSchema>;

export const bulkImportSchema = z.object({
  body: z.object({
    duplicateStrategy: z.enum(['skip', 'update']),
    rows: z.array(bulkInventoryRowSchema).min(1),
  }),
});
