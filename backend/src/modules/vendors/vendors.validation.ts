import { z } from 'zod';

export const createVendorSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Vendor name is required'),
    address: z.string().trim().optional(),
    gstNumber: z.string().trim().optional(),
    email: z.string().trim().email().optional().or(z.literal('')),
    phone: z.string().trim().optional(),
    contactPerson: z.string().trim().optional(),
    active: z.boolean().default(true),
  }),
});

export const updateVendorSchema = z.object({
  body: createVendorSchema.shape.body.partial(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
