import { z } from 'zod';

export const createProjectUnitSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Project is required'),
    name: z.string().trim().min(1, 'Unit Name is required'),
    description: z.string().trim().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  }),
});

/// Project is never editable after creation — a Unit that turns out to
/// belong to the wrong project should be deactivated and recreated, same
/// reasoning as PurchaseOrder's projectId being locked post-creation.
export const updateProjectUnitSchema = z.object({
  body: createProjectUnitSchema.shape.body.omit({ projectId: true }).partial(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

export const listQuerySchema = z.object({
  query: z.object({ projectId: z.string().uuid().optional() }),
});
