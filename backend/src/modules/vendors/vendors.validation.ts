import { z } from 'zod';

export const createVendorSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Vendor Name and Contact Number are mandatory'),
    address: z.string().trim().optional(),
    productName: z.string().trim().optional(),
    gstNumber: z.string().trim().optional(),
    email: z.string().trim().email().optional().or(z.literal('')),
    phone: z.string().trim().min(1, 'Vendor Name and Contact Number are mandatory'),
    contactPerson: z.string().trim().optional(),
    bankAccountNumber: z.string().trim().optional(),
    bankIfscCode: z.string().trim().optional(),
    active: z.boolean().default(true),
  }),
});

/// `.partial()` still requires `phone`/`name` to be non-empty *if the key
/// is sent at all* — omitting the key leaves it unchanged, but sending an
/// empty string can't silently clear a mandatory field.
export const updateVendorSchema = z.object({
  body: createVendorSchema.shape.body.partial(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
