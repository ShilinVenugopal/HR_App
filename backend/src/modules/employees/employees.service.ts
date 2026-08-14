import { Prisma } from '@prisma/client';
import { Request } from 'express';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, hasProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';
import { BulkEmployeeRow } from './employees.validation';

const includeRelations = {
  project: { select: { id: true, projectName: true } },
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
  reportingManager: { select: { id: true, name: true, employeeCode: true } },
} satisfies Prisma.EmployeeInclude;

/// Blank optional identifier fields must never be stored as '' — a
/// unique constraint (aadhaarNumber) treats '' as a real value, so two
/// blank entries would collide. Only NULL is treated as "not set".
function nullifyBlank<T extends Record<string, unknown>>(input: T, keys: readonly (keyof T)[]): T {
  const next = { ...input };
  for (const key of keys) {
    if (next[key] === '') next[key] = null as T[keyof T];
  }
  return next;
}

const OPTIONAL_UNIQUE_FIELDS = ['aadhaarNumber', 'panNumber', 'bankIfscCode', 'bankAccountNumber'] as const;

/// Used only for candidates converted from Recruitment, which has no field
/// for the user to type a code into. Every other creation path (manual
/// Add Employee form, Excel import) requires a user-supplied Employee
/// Code, per the Employee Master spec.
async function generateEmployeeCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `EMP${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const exists = await prisma.employee.findUnique({ where: { employeeCode: code } });
    if (!exists) return code;
  }
  throw ApiError.internal('Could not generate a unique employee code, please retry');
}

export interface EmployeeFilters {
  projectId?: string;
  departmentId?: string;
  designationId?: string;
  status?: string;
}

export async function listEmployees(req: Request, pagination: PaginationParams, filters: EmployeeFilters) {
  const where: Prisma.EmployeeWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.designationId ? { designationId: filters.designationId } : {}),
    ...(filters.status ? { status: filters.status as any } : {}),
    ...(pagination.search
      ? {
          OR: [
            { name: { contains: pagination.search, mode: 'insensitive' } },
            { employeeCode: { contains: pagination.search, mode: 'insensitive' } },
            { contactNumber: { contains: pagination.search, mode: 'insensitive' } },
            { aadhaarNumber: { contains: pagination.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: includeRelations,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'createdAt']: pagination.sortOrder },
    }),
    prisma.employee.count({ where }),
  ]);

  return { rows, total };
}

export async function getEmployee(req: Request, id: string) {
  const employee = await prisma.employee.findUnique({ where: { id }, include: includeRelations });
  if (!employee) throw ApiError.notFound('Employee not found');
  assertProjectAccess(req, employee.projectId);
  return employee;
}

/// Proactive duplicate check before insert/update, so the caller gets a
/// clear "Employee Code already in use" / "Aadhaar already in use"
/// message instead of a raw database constraint error.
async function assertNoDuplicates(employeeCode: string | undefined, aadhaarNumber: string | null | undefined, excludeId?: string) {
  const [byCode, byAadhaar] = await Promise.all([
    employeeCode ? prisma.employee.findFirst({ where: { employeeCode, id: excludeId ? { not: excludeId } : undefined } }) : null,
    aadhaarNumber ? prisma.employee.findFirst({ where: { aadhaarNumber, id: excludeId ? { not: excludeId } : undefined } }) : null,
  ]);
  if (byCode) throw ApiError.conflict(`Employee Code "${employeeCode}" is already in use`);
  if (byAadhaar) throw ApiError.conflict(`Aadhaar Number "${aadhaarNumber}" is already in use`);
}

export async function createEmployee(req: Request, input: Omit<Prisma.EmployeeUncheckedCreateInput, 'id'>, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);
  const data = nullifyBlank(input, OPTIONAL_UNIQUE_FIELDS);
  await assertNoDuplicates(data.employeeCode, data.aadhaarNumber as string | null);

  const employee = await prisma.employee.create({ data, include: includeRelations });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'EMPLOYEES',
    projectId: employee.projectId,
    status: 'SUCCESS',
    meta,
    details: { employeeId: employee.id, employeeCode: employee.employeeCode },
  });

  return employee;
}

export async function updateEmployee(req: Request, id: string, input: Prisma.EmployeeUncheckedUpdateInput, meta?: RequestMeta) {
  const existing = await getEmployee(req, id);
  if (input.projectId) assertProjectAccess(req, input.projectId as string);

  const data = nullifyBlank(input, OPTIONAL_UNIQUE_FIELDS);
  await assertNoDuplicates(data.employeeCode as string | undefined, data.aadhaarNumber as string | null | undefined, id);

  const employee = await prisma.employee.update({ where: { id }, data, include: includeRelations });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'EMPLOYEES',
    projectId: employee.projectId ?? existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { employeeId: id, changes: input },
  });

  return employee;
}

export async function deleteEmployee(req: Request, id: string, meta?: RequestMeta) {
  const existing = await getEmployee(req, id);
  await prisma.employee.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'EMPLOYEES',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { employeeId: id },
  });
}

/// Bridges Recruitment → Employees: promotes a JOINED candidate into the
/// Employee master without re-keying their details.
export async function createEmployeeFromCandidate(req: Request, candidateId: string, meta?: RequestMeta) {
  const candidate = await prisma.recruitmentCandidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!candidate.projectId) throw ApiError.badRequest('Candidate must have an assigned project before conversion');
  assertProjectAccess(req, candidate.projectId);

  const existingLink = await prisma.employee.findUnique({ where: { candidateId } });
  if (existingLink) throw ApiError.conflict('This candidate has already been converted to an employee');

  const employeeCode = await generateEmployeeCode();
  const employee = await prisma.employee.create({
    data: {
      employeeCode,
      name: candidate.candidateName,
      contactNumber: candidate.contactNumber,
      email: candidate.email,
      dateOfBirth: candidate.dateOfBirth,
      designationId: candidate.designationId,
      projectId: candidate.projectId,
      joiningDate: new Date(),
      candidateId: candidate.id,
      costCode: candidate.costCode,
    },
    include: includeRelations,
  });

  await prisma.recruitmentCandidate.update({ where: { id: candidateId }, data: { status: 'JOINED' } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'EMPLOYEES',
    projectId: employee.projectId,
    status: 'SUCCESS',
    meta,
    details: { employeeId: employee.id, fromCandidateId: candidateId },
  });

  return employee;
}

// ── Bulk import (Excel) ─────────────────────────────────────────────────

export interface DuplicateMatch {
  id: string;
  employeeCode: string;
  aadhaarNumber: string | null;
  name: string;
}

export async function checkDuplicateEmployees(req: Request, employeeCodes: string[], aadhaarNumbers: string[]): Promise<DuplicateMatch[]> {
  const codes = Array.from(new Set(employeeCodes.map((c) => c.trim()).filter(Boolean)));
  const aadhaars = Array.from(new Set(aadhaarNumbers.map((a) => a.trim()).filter(Boolean)));
  if (!codes.length && !aadhaars.length) return [];

  return prisma.employee.findMany({
    where: {
      OR: [...(codes.length ? [{ employeeCode: { in: codes } }] : []), ...(aadhaars.length ? [{ aadhaarNumber: { in: aadhaars } }] : [])],
    },
    select: { id: true, employeeCode: true, aadhaarNumber: true, name: true },
  });
}

export interface BulkImportFailure {
  rowNumber: number;
  employeeCode: string;
  name: string;
  reason: string;
}

export interface BulkImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  failures: BulkImportFailure[];
}

const CREATE_BATCH_SIZE = 500;

/// Batched Excel import. Every row is re-validated server-side (project/
/// department/designation existence + project access) even though the
/// client already checked — never trust a client-submitted bulk payload.
/// New employees are inserted with chunked `createMany` calls (never one
/// row at a time); rows matching an existing Employee Code within the
/// caller's accessible projects are either skipped or updated per
/// `duplicateStrategy`, batched into one transaction. Rows whose Aadhaar
/// collides with a *different* employee always fail — that's a data
/// error, not something a duplicate strategy should paper over.
export async function bulkImportEmployees(
  req: Request,
  rows: BulkEmployeeRow[],
  duplicateStrategy: 'skip' | 'update',
  meta?: RequestMeta
): Promise<BulkImportResult> {
  const result: BulkImportResult = { total: rows.length, imported: 0, updated: 0, skipped: 0, failed: 0, failures: [] };

  const projectIds = Array.from(new Set(rows.map((r) => r.projectId).filter(Boolean)));
  const departmentIds = Array.from(new Set(rows.map((r) => r.departmentId).filter((v): v is string => Boolean(v))));
  const designationIds = Array.from(new Set(rows.map((r) => r.designationId).filter((v): v is string => Boolean(v))));

  const [validProjects, validDepartments, validDesignations, existingByCode, existingByAadhaar] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } }),
    departmentIds.length ? prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true } }) : Promise.resolve([]),
    designationIds.length ? prisma.designation.findMany({ where: { id: { in: designationIds } }, select: { id: true } }) : Promise.resolve([]),
    prisma.employee.findMany({ where: { employeeCode: { in: rows.map((r) => r.employeeCode) } }, select: { id: true, employeeCode: true } }),
    prisma.employee.findMany({
      where: { aadhaarNumber: { in: rows.map((r) => r.aadhaarNumber).filter((v): v is string => Boolean(v)) } },
      select: { id: true, employeeCode: true, aadhaarNumber: true },
    }),
  ]);

  const validProjectIds = new Set(validProjects.map((p) => p.id));
  const validDepartmentIds = new Set(validDepartments.map((d) => d.id));
  const validDesignationIds = new Set(validDesignations.map((d) => d.id));
  const existingByCodeMap = new Map(existingByCode.map((e) => [e.employeeCode, e.id]));
  const existingByAadhaarMap = new Map(existingByAadhaar.filter((e) => e.aadhaarNumber).map((e) => [e.aadhaarNumber as string, e]));

  const toCreate: { rowNumber: number; data: Prisma.EmployeeCreateManyInput }[] = [];
  const toUpdate: { rowNumber: number; id: string; data: Prisma.EmployeeUpdateInput }[] = [];
  const seenCodesInFile = new Set<string>();
  const seenAadhaarsInFile = new Set<string>();

  for (const row of rows) {
    const fail = (reason: string) => {
      result.failed += 1;
      result.failures.push({ rowNumber: row.rowNumber, employeeCode: row.employeeCode, name: row.name, reason });
    };

    if (seenCodesInFile.has(row.employeeCode)) {
      fail('Duplicate Employee Code within this file');
      continue;
    }
    if (row.aadhaarNumber && seenAadhaarsInFile.has(row.aadhaarNumber)) {
      fail('Duplicate Aadhaar Number within this file');
      continue;
    }
    if (!validProjectIds.has(row.projectId)) {
      fail('Project not found');
      continue;
    }
    if (!hasProjectAccess(req, row.projectId)) {
      fail('You are not assigned to this project');
      continue;
    }
    if (row.departmentId && !validDepartmentIds.has(row.departmentId)) {
      fail('Department not found');
      continue;
    }
    if (row.designationId && !validDesignationIds.has(row.designationId)) {
      fail('Designation not found');
      continue;
    }

    const existingIdByCode = existingByCodeMap.get(row.employeeCode);
    const existingByAadhaarRecord = row.aadhaarNumber ? existingByAadhaarMap.get(row.aadhaarNumber) : undefined;
    if (existingByAadhaarRecord && existingByAadhaarRecord.id !== existingIdByCode) {
      fail(`Aadhaar Number already belongs to employee ${existingByAadhaarRecord.employeeCode}`);
      continue;
    }

    seenCodesInFile.add(row.employeeCode);
    if (row.aadhaarNumber) seenAadhaarsInFile.add(row.aadhaarNumber);

    const commonData = nullifyBlank(
      {
        name: row.name,
        fatherName: row.fatherName || null,
        contactNumber: row.contactNumber,
        dateOfBirth: row.dateOfBirth ?? null,
        joiningDate: row.joiningDate ?? null,
        departmentId: row.departmentId || null,
        designationId: row.designationId || null,
        projectId: row.projectId,
        panNumber: row.panNumber || null,
        aadhaarNumber: row.aadhaarNumber || null,
        passportNumber: row.passportNumber || null,
        pfNumber: row.pfNumber || null,
        uanNumber: row.uanNumber || null,
        esicNumber: row.esicNumber || null,
        bankAccountNumber: row.bankAccountNumber || null,
        bankIfscCode: row.bankIfscCode || null,
        bankName: row.bankName || null,
        bankAccountName: row.bankAccountName || null,
        address: row.address || null,
        status: row.status,
      },
      OPTIONAL_UNIQUE_FIELDS
    );

    if (existingIdByCode) {
      if (duplicateStrategy === 'skip') {
        result.skipped += 1;
        continue;
      }
      toUpdate.push({ rowNumber: row.rowNumber, id: existingIdByCode, data: commonData });
      continue;
    }

    toCreate.push({ rowNumber: row.rowNumber, data: { ...commonData, employeeCode: row.employeeCode } });
  }

  for (let i = 0; i < toCreate.length; i += CREATE_BATCH_SIZE) {
    const chunk = toCreate.slice(i, i + CREATE_BATCH_SIZE);
    try {
      const created = await prisma.employee.createMany({ data: chunk.map((c) => c.data) });
      result.imported += created.count;
    } catch {
      for (const row of chunk) {
        result.failed += 1;
        result.failures.push({ rowNumber: row.rowNumber, employeeCode: row.data.employeeCode, name: row.data.name as string, reason: 'Database error while inserting this batch' });
      }
    }
  }

  if (toUpdate.length) {
    try {
      await prisma.$transaction(toUpdate.map((u) => prisma.employee.update({ where: { id: u.id }, data: u.data })));
      result.updated += toUpdate.length;
    } catch {
      for (const u of toUpdate) {
        result.failed += 1;
        result.failures.push({ rowNumber: u.rowNumber, employeeCode: (u.data.employeeCode as string) ?? '', name: (u.data.name as string) ?? '', reason: 'Database error while updating this record' });
      }
    }
  }

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'EMPLOYEES',
    status: 'SUCCESS',
    meta,
    details: {
      bulkImport: true,
      total: result.total,
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    },
  });

  return result;
}
