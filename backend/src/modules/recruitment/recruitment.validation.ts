import { z } from 'zod';
import { CandidateStatus, EmployeeCostCode, InterviewStage } from '@prisma/client';

export const createCandidateSchema = z.object({
  body: z.object({
    candidateName: z.string().trim().min(2, 'Candidate Name is required'),
    contactNumber: z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'Contact Number is required and must be valid'),
    dateOfBirth: z.coerce.date().optional().nullable(),
    qualification: z.string().trim().optional(),
    experience: z.string().trim().optional(),
    designationId: z.string().uuid().optional().nullable(),
    email: z.string().trim().email().optional().or(z.literal('')).nullable(),
    projectId: z.string().uuid().optional().nullable(),
    resumeUrl: z.string().trim().optional().nullable(),
    foraysInterviewStatus: z.nativeEnum(InterviewStage).default(InterviewStage.NOT_STARTED),
    clientInterviewStatus: z.nativeEnum(InterviewStage).default(InterviewStage.NOT_STARTED),
    remarks: z.string().trim().optional(),
    status: z.nativeEnum(CandidateStatus).default(CandidateStatus.APPLIED),
    // Fixed 3-option payroll cost category (F01A/F02A/F03A) — z.nativeEnum
    // rejects anything else outright, so no other code can ever be
    // manually entered or created through this endpoint.
    costCode: z.nativeEnum(EmployeeCostCode).optional().nullable(),
  }),
});

export const updateCandidateSchema = z.object({
  body: createCandidateSchema.shape.body.partial(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

// ── Bulk import (Excel) ─────────────────────────────────────────────────
// Kept intentionally lenient (only candidateName + contactNumber required)
// to match the existing single-candidate Add Candidate form's validation
// rule — bulk import must not impose a stricter rule than manual entry.
const bulkCandidateRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  candidateName: z.string().trim().min(1, 'Candidate Name is required'),
  contactNumber: z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'Contact Number must be 7-15 digits'),
  dateOfBirth: z.coerce.date().optional().nullable(),
  qualification: z.string().trim().optional().nullable(),
  experience: z.string().trim().optional().nullable(),
  designationId: z.string().uuid().optional().nullable(),
  email: z.string().trim().email().optional().or(z.literal('')).nullable(),
  projectId: z.string().uuid().optional().nullable(),
  resumeUrl: z.string().trim().optional().nullable(),
  foraysInterviewStatus: z.nativeEnum(InterviewStage).default(InterviewStage.NOT_STARTED),
  clientInterviewStatus: z.nativeEnum(InterviewStage).default(InterviewStage.NOT_STARTED),
  remarks: z.string().trim().optional().nullable(),
  status: z.nativeEnum(CandidateStatus).default(CandidateStatus.APPLIED),
  // Same enforcement as the manual form — an invalid code fails Zod
  // validation, which the service turns into a per-row import failure
  // rather than a silently-imported bad value.
  costCode: z.nativeEnum(EmployeeCostCode).optional().nullable(),
});

export const checkDuplicatesSchema = z.object({
  body: z.object({
    contactNumbers: z.array(z.string().trim().min(1)).min(1).max(2000),
  }),
});

export const bulkImportSchema = z.object({
  body: z.object({
    rows: z.array(bulkCandidateRowSchema).min(1).max(2000),
    duplicateStrategy: z.enum(['skip', 'update']).default('skip'),
  }),
});

export type BulkCandidateRow = z.infer<typeof bulkCandidateRowSchema>;
