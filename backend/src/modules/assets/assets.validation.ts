import { z } from 'zod';
import { AssetUnit } from '@prisma/client';

export const createAssetSchema = z.object({
  body: z.object({
    costCode: z.string().trim().min(1, 'Cost Code is required'),
    itemDescription: z.string().trim().min(1, 'Item Description is required'),
    unit: z.nativeEnum(AssetUnit),
    workingQuantity: z.coerce.number().min(0, 'Working Quantity must be zero or greater'),
    nonWorkingQuantity: z.coerce.number().min(0, 'Non-working Quantity must be zero or greater'),
    remarks: z.string().trim().optional().nullable(),
    date: z.coerce.date(),
    projectId: z.string().uuid('Project is required'),
  }),
});

export const updateAssetSchema = z.object({
  body: createAssetSchema.shape.body.partial(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

// ── Bulk import (Excel) ─────────────────────────────────────────────────
// Mirrors createAssetSchema exactly — bulk import must not impose a
// stricter rule than manual entry.
const bulkAssetRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  costCode: z.string().trim().min(1, 'Cost Code is required'),
  itemDescription: z.string().trim().min(1, 'Item Description is required'),
  unit: z.nativeEnum(AssetUnit),
  workingQuantity: z.coerce.number().min(0, 'Working Quantity must be zero or greater'),
  nonWorkingQuantity: z.coerce.number().min(0, 'Non-working Quantity must be zero or greater'),
  remarks: z.string().trim().optional().nullable(),
  date: z.coerce.date(),
  projectId: z.string().uuid('Project is required'),
});

export const bulkImportSchema = z.object({
  body: z.object({
    rows: z.array(bulkAssetRowSchema).min(1).max(2000),
  }),
});

export type BulkAssetRow = z.infer<typeof bulkAssetRowSchema>;
