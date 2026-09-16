import { z } from 'zod';
import { ProjectStatus } from '@prisma/client';

export const createCostCodeSchema = z.object({
  body: z.object({
    code: z.string().trim().min(1, 'Cost Code is required').toUpperCase(),
    name: z.string().trim().min(2, 'Description is required'),
    itemsToConsider: z.string().trim().optional(),
    remarks: z.string().trim().optional(),
    responsiblePerson: z.string().trim().optional(),
    status: z.nativeEnum(ProjectStatus).default(ProjectStatus.ACTIVE),
  }),
});

/// Code is intentionally not editable after creation — cost codes are
/// referenced by id everywhere (Inventory/PR/PO/GRN items), so renaming
/// the code string in place is fine, but this endpoint still treats it as
/// part of the same identity update rather than a rename-and-relink; if a
/// Super Admin does need to fix a typo'd code, that's still just a normal
/// field update since nothing else keys off the code string directly.
export const updateCostCodeSchema = z.object({
  body: z.object({
    code: z.string().trim().min(1, 'Cost Code is required').toUpperCase().optional(),
    name: z.string().trim().min(2, 'Description is required').optional(),
    itemsToConsider: z.string().trim().optional(),
    remarks: z.string().trim().optional(),
    responsiblePerson: z.string().trim().optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
  }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
