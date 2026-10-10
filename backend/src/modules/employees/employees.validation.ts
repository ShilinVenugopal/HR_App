import { z } from 'zod';
import { EmployeeCostCode, EmployeeStatus } from '@prisma/client';

const CONTACT_NUMBER_REGEX = /^\d{10}$/;
const AADHAAR_REGEX = /^\d{12}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const BANK_ACCOUNT_REGEX = /^\d+$/;

const notFutureDate = (message: string) =>
  z.coerce
    .date()
    .optional()
    .nullable()
    .refine((d) => !d || d.getTime() <= Date.now(), { message });

/// Shared field shape for the manual Add/Edit Employee form and each bulk
/// import row — the same rules apply either way, so import can never
/// silently accept data the manual form would reject.
const employeeFieldsSchema = {
  employeeCode: z.string().trim().min(1, 'Employee Code is required'),
  name: z.string().trim().min(1, 'Employee Name is required'),
  fatherName: z.string().trim().optional().nullable(),
  contactNumber: z.string().trim().regex(CONTACT_NUMBER_REGEX, 'Contact Number must be exactly 10 digits'),
  dateOfBirth: notFutureDate('Date of Birth cannot be a future date'),
  joiningDate: notFutureDate('Date of Joining cannot be a future date'),
  departmentId: z.string().uuid().optional().nullable(),
  designationId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid({ message: 'Project is required — every employee must belong to exactly one project' }),
  reportingManagerId: z.string().uuid().optional().nullable(),
  panNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(PAN_REGEX, 'PAN must be in the format ABCDE1234F')
    .optional()
    .or(z.literal(''))
    .nullable(),
  aadhaarNumber: z.string().trim().regex(AADHAAR_REGEX, 'Aadhaar must be exactly 12 digits').optional().or(z.literal('')).nullable(),
  passportNumber: z.string().trim().optional().nullable(),
  pfNumber: z.string().trim().optional().nullable(),
  uanNumber: z.string().trim().optional().nullable(),
  esicNumber: z.string().trim().optional().nullable(),
  bankAccountNumber: z
    .string()
    .trim()
    .regex(BANK_ACCOUNT_REGEX, 'Bank Account Number must contain digits only')
    .optional()
    .or(z.literal(''))
    .nullable(),
  bankIfscCode: z.string().trim().toUpperCase().regex(IFSC_REGEX, 'IFSC must be a valid 11-character code').optional().or(z.literal('')).nullable(),
  bankName: z.string().trim().optional().nullable(),
  bankAccountName: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  documents: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  status: z.nativeEnum(EmployeeStatus).default(EmployeeStatus.ACTIVE),
  // Fixed 3-option payroll cost category — the single source of truth
  // read by every module that lets a user pick an employee (Attendance,
  // Wages, etc.). z.nativeEnum rejects anything outside F01A/F02A/F03A.
  costCode: z.nativeEnum(EmployeeCostCode).optional().nullable(),
};

export const createEmployeeSchema = z.object({
  body: z.object(employeeFieldsSchema),
});

export const updateEmployeeSchema = z.object({
  body: z.object(employeeFieldsSchema).partial(),
});

export const idParamSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

// ── Bulk import (Excel) ─────────────────────────────────────────────────
const bulkEmployeeRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  ...employeeFieldsSchema,
});

export const checkDuplicatesSchema = z.object({
  body: z.object({
    employeeCodes: z.array(z.string().trim().min(1)).max(2000).optional().default([]),
    aadhaarNumbers: z.array(z.string().trim().min(1)).max(2000).optional().default([]),
  }),
});

export const bulkImportSchema = z.object({
  body: z.object({
    rows: z.array(bulkEmployeeRowSchema).min(1).max(2000),
    duplicateStrategy: z.enum(['skip', 'update']).default('skip'),
  }),
});

export type BulkEmployeeRow = z.infer<typeof bulkEmployeeRowSchema>;
