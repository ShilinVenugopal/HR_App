import { z } from 'zod';
import { CandidateStatus, InterviewStage } from '@prisma/client';

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
  }),
});

export const updateCandidateSchema = z.object({
  body: createCandidateSchema.shape.body.partial(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
