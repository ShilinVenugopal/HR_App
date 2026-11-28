import { z } from 'zod';

/// A full bulk-replace, not per-term CRUD — the template is a short,
/// ordered list (~11 rows) that Super Admin edits/reorders/adds/removes
/// in one sitting and saves once, so one PUT that replaces the whole set
/// is simpler than five separate endpoints for the same outcome.
export const replacePoTermsSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          heading: z.string().trim().min(1, 'Heading is required'),
          body: z.string().trim().min(1, 'Body is required'),
        })
      )
      .min(1, 'At least one term is required'),
  }),
});
