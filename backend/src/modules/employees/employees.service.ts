import { Prisma } from '@prisma/client';
import { Request } from 'express';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const includeRelations = {
  project: { select: { id: true, projectName: true } },
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
  reportingManager: { select: { id: true, name: true, employeeCode: true } },
} satisfies Prisma.EmployeeInclude;

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
            { employeeId: { contains: pagination.search, mode: 'insensitive' } },
            { contactNumber: { contains: pagination.search, mode: 'insensitive' } },
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

export async function createEmployee(req: Request, input: Omit<Prisma.EmployeeUncheckedCreateInput, 'employeeCode'>, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);

  const employeeCode = await generateEmployeeCode();
  const employee = await prisma.employee.create({
    data: { ...input, employeeCode },
    include: includeRelations,
  });

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

  const employee = await prisma.employee.update({ where: { id }, data: input, include: includeRelations });

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
