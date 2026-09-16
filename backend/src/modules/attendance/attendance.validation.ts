import { z } from 'zod';
import { AttendanceStatus, Shift } from '@prisma/client';

export const createAttendanceSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid('Employee is required'),
    date: z.coerce.date({ required_error: 'Date is required' }),
    unitId: z.string().uuid('Unit is mandatory for marking attendance.'),
    shift: z.nativeEnum(Shift).default(Shift.GENERAL),
    inTime: z.string().trim().optional(),
    outTime: z.string().trim().optional(),
    status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.PRESENT),
    overtimeHours: z.coerce.number().min(0).max(24).default(0),
    remarks: z.string().trim().optional(),
  }),
});

export const updateAttendanceSchema = z.object({
  body: createAttendanceSchema.shape.body.partial().omit({ employeeId: true }),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

export const manpowerSummaryQuerySchema = z.object({
  query: z.object({
    projectId: z.string().uuid('Project is required'),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
  }),
});

export const manpowerSummaryEmployeesQuerySchema = z.object({
  query: z.object({
    projectId: z.string().uuid('Project is required'),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
    unitId: z.string().optional(),
  }),
});
