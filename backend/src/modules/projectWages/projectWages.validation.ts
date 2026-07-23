import { z } from 'zod';

export const codeParamSchema = z.object({ params: z.object({ code: z.string().min(1) }) });

export const entriesQuerySchema = z.object({
  params: z.object({ code: z.string().min(1) }),
  query: z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
    search: z.string().optional(),
  }),
});

export const summaryQuerySchema = entriesQuerySchema;

export const historyParamSchema = z.object({
  params: z.object({ code: z.string().min(1), employeeCode: z.string().min(1) }),
});

const rawValueSchema = z.union([z.string(), z.number(), z.null()]);

export const createEntrySchema = z.object({
  params: z.object({ code: z.string().min(1) }),
  body: z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
    values: z.record(rawValueSchema),
  }),
});

export const updateEntrySchema = z.object({
  params: z.object({ code: z.string().min(1), id: z.string().uuid() }),
  body: z.object({
    values: z.record(rawValueSchema),
  }),
});

export const deleteEntrySchema = z.object({
  params: z.object({ code: z.string().min(1), id: z.string().uuid() }),
});

export const importSchema = z.object({
  params: z.object({ code: z.string().min(1) }),
  body: z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
    fileName: z.string().min(1),
    fileUrl: z.string().min(1),
    rows: z
      .array(
        z.object({
          rowNumber: z.number().int(),
          values: z.record(rawValueSchema),
        })
      )
      .min(1, 'Uploaded file has no data rows'),
  }),
});
