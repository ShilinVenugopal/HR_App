import { z } from 'zod';
import { EmployeeStatus } from '@prisma/client';

export const createEmployeeSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Employee name is required'),
    employeeId: z.string().trim().optional().nullable(),
    contactNumber: z.string().trim().optional(),
    email: z.string().trim().email().optional().or(z.literal('')).nullable(),
    dateOfBirth: z.coerce.date().optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
    designationId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid({ message: 'Project is required — every employee must belong to exactly one project' }),
    joiningDate: z.coerce.date().optional().nullable(),
    reportingManagerId: z.string().uuid().optional().nullable(),
    documents: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
    status: z.nativeEnum(EmployeeStatus).default(EmployeeStatus.ACTIVE),
  }),
});

export const updateEmployeeSchema = z.object({
  body: createEmployeeSchema.shape.body.partial(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
