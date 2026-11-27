import { ContractingType, MSMEType, Prisma, SubcontractorStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const auditFieldsInclude = {
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.SubcontractorInclude;

export interface SubcontractorFilters {
  contractingType?: ContractingType;
  status?: SubcontractorStatus;
}

/// Search covers company name and contracting type (req: "search
/// subcontractors by company name and Contracting Type").
export async function listSubcontractors(pagination: PaginationParams, filters: SubcontractorFilters) {
  const where: Prisma.SubcontractorWhereInput = {
    ...(filters.contractingType ? { contractingType: filters.contractingType } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(pagination.search
      ? {
          OR: [
            { companyName: { contains: pagination.search, mode: 'insensitive' } },
            { contactPerson: { contains: pagination.search, mode: 'insensitive' } },
            { gstNumber: { contains: pagination.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.subcontractor.findMany({
      where,
      include: auditFieldsInclude,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'companyName']: pagination.sortOrder },
    }),
    prisma.subcontractor.count({ where }),
  ]);

  return { rows, total };
}

/// Lightweight list (id + companyName + status) for the Subcontractor
/// Payments bill-entry dropdown — never includes bank details.
export async function listSubcontractorOptions() {
  return prisma.subcontractor.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, companyName: true, contractingType: true },
    orderBy: { companyName: 'asc' },
  });
}

export async function getSubcontractor(id: string) {
  const subcontractor = await prisma.subcontractor.findUnique({ where: { id }, include: auditFieldsInclude });
  if (!subcontractor) throw ApiError.notFound('Subcontractor not found');
  return subcontractor;
}

export interface SubcontractorInput {
  companyName: string;
  contactPerson?: string;
  address?: string;
  gstNumber?: string;
  panNumber?: string;
  msmeAvailable: boolean;
  msmeNumber?: string | null;
  msmeType?: MSMEType | null;
  contactNumber: string;
  email?: string;
  bankAccountNumber: string;
  bankName: string;
  ifscCode: string;
  contractingType: ContractingType;
  status?: SubcontractorStatus;
}

export async function createSubcontractor(input: SubcontractorInput, actingUserId: string, meta?: RequestMeta) {
  const subcontractor = await prisma.subcontractor.create({
    data: {
      companyName: input.companyName,
      contactPerson: input.contactPerson || null,
      address: input.address || null,
      gstNumber: input.gstNumber || null,
      panNumber: input.panNumber || null,
      msmeAvailable: input.msmeAvailable,
      msmeNumber: input.msmeAvailable ? input.msmeNumber || null : null,
      msmeType: input.msmeAvailable ? input.msmeType || null : null,
      contactNumber: input.contactNumber,
      email: input.email || null,
      bankAccountNumber: input.bankAccountNumber,
      bankName: input.bankName,
      ifscCode: input.ifscCode,
      contractingType: input.contractingType,
      status: input.status ?? 'ACTIVE',
      createdById: actingUserId,
    },
    include: auditFieldsInclude,
  });

  await recordAuditLog({
    userId: actingUserId,
    action: 'CREATE',
    module: 'SUBCONTRACTORS',
    status: 'SUCCESS',
    meta,
    details: { subcontractorId: subcontractor.id, companyName: subcontractor.companyName },
  });

  return subcontractor;
}

export async function updateSubcontractor(id: string, input: Partial<SubcontractorInput>, actingUserId: string, meta?: RequestMeta) {
  const existing = await getSubcontractor(id);

  const nextMsmeAvailable = input.msmeAvailable ?? existing.msmeAvailable;
  const nextMsmeNumber = input.msmeNumber !== undefined ? input.msmeNumber : existing.msmeNumber;
  const nextMsmeType = input.msmeType !== undefined ? input.msmeType : existing.msmeType;
  if (nextMsmeAvailable && !nextMsmeNumber?.trim()) {
    throw ApiError.badRequest('MSME Number is required when MSME Available is Yes');
  }
  if (nextMsmeAvailable && !nextMsmeType) {
    throw ApiError.badRequest('MSME Type is required when MSME Available is Yes');
  }

  const subcontractor = await prisma.subcontractor.update({
    where: { id },
    data: {
      companyName: input.companyName,
      contactPerson: input.contactPerson !== undefined ? input.contactPerson || null : undefined,
      address: input.address !== undefined ? input.address || null : undefined,
      gstNumber: input.gstNumber !== undefined ? input.gstNumber || null : undefined,
      panNumber: input.panNumber !== undefined ? input.panNumber || null : undefined,
      msmeAvailable: input.msmeAvailable,
      // Cleared together whenever MSME Available flips to No, even if the
      // caller didn't explicitly send null for them (req: "If No is
      // selected, hide the MSME Number and MSME Type fields" — hidden
      // fields must not leave stale data behind).
      msmeNumber: nextMsmeAvailable ? (input.msmeNumber !== undefined ? input.msmeNumber || null : undefined) : null,
      msmeType: nextMsmeAvailable ? (input.msmeType !== undefined ? input.msmeType || null : undefined) : null,
      contactNumber: input.contactNumber,
      email: input.email !== undefined ? input.email || null : undefined,
      bankAccountNumber: input.bankAccountNumber,
      bankName: input.bankName,
      ifscCode: input.ifscCode,
      contractingType: input.contractingType,
      status: input.status,
      updatedById: actingUserId,
    },
    include: auditFieldsInclude,
  });

  await recordAuditLog({
    userId: actingUserId,
    action: 'UPDATE',
    module: 'SUBCONTRACTORS',
    status: 'SUCCESS',
    meta,
    details: { subcontractorId: id, changes: input },
  });

  return subcontractor;
}

/// Hard delete only when no bill has ever been raised against this
/// subcontractor; otherwise the caller is told to set it Inactive instead —
/// same "block delete if referenced, use a status field for the safe path"
/// convention as Vendor (req: "do not permanently delete... if a
/// subcontractor already has payment or billing records").
export async function deleteSubcontractor(id: string, actingUserId: string, meta?: RequestMeta) {
  await getSubcontractor(id);

  const billCount = await prisma.subcontractorBill.count({ where: { subcontractorId: id } });
  if (billCount > 0) {
    throw ApiError.conflict('This subcontractor has billing/payment records and cannot be deleted. Set it to Inactive instead.');
  }

  await prisma.subcontractor.delete({ where: { id } });

  await recordAuditLog({
    userId: actingUserId,
    action: 'DELETE',
    module: 'SUBCONTRACTORS',
    status: 'SUCCESS',
    meta,
    details: { subcontractorId: id },
  });
}
