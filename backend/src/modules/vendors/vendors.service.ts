import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const auditFieldsInclude = {
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.VendorInclude;

/// Vendors are not project-scoped — a supplier can serve multiple
/// projects, and which projects have actually used them falls out of
/// their PurchaseOrder history rather than an explicit assignment.
export async function listVendors(pagination: PaginationParams) {
  const where: Prisma.VendorWhereInput = pagination.search
    ? {
        OR: [
          { name: { contains: pagination.search, mode: 'insensitive' } },
          { productName: { contains: pagination.search, mode: 'insensitive' } },
          { gstNumber: { contains: pagination.search, mode: 'insensitive' } },
          { contactPerson: { contains: pagination.search, mode: 'insensitive' } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      include: auditFieldsInclude,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'name']: pagination.sortOrder },
    }),
    prisma.vendor.count({ where }),
  ]);

  return { rows, total };
}

export async function getVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id }, include: auditFieldsInclude });
  if (!vendor) throw ApiError.notFound('Vendor not found');
  return vendor;
}

/// Checked before create — a soft warning only (per the design brief:
/// "do not automatically delete or overwrite"), so the caller decides
/// whether to still proceed.
export async function findPossibleDuplicateVendor(name: string, phone: string) {
  return prisma.vendor.findFirst({
    where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { phone: { equals: phone, mode: 'insensitive' } }] },
    select: { id: true, name: true, phone: true },
  });
}

export interface VendorInput {
  name: string;
  address?: string;
  productName?: string;
  gstNumber?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  bankAccountNumber?: string;
  bankIfscCode?: string;
  active?: boolean;
}

export async function createVendor(input: VendorInput, actingUserId: string, meta?: RequestMeta) {
  const vendor = await prisma.vendor.create({
    data: {
      name: input.name,
      address: input.address || null,
      productName: input.productName || null,
      gstNumber: input.gstNumber || null,
      email: input.email || null,
      phone: input.phone || null,
      contactPerson: input.contactPerson || null,
      bankAccountNumber: input.bankAccountNumber || null,
      bankIfscCode: input.bankIfscCode || null,
      active: input.active ?? true,
      createdById: actingUserId,
      updatedById: actingUserId,
    },
    include: auditFieldsInclude,
  });

  await recordAuditLog({
    userId: actingUserId,
    action: 'CREATE',
    module: 'PURCHASE_ORDER',
    status: 'SUCCESS',
    meta,
    details: { vendorId: vendor.id, name: vendor.name },
  });

  return vendor;
}

export async function updateVendor(id: string, input: Partial<VendorInput>, actingUserId: string, meta?: RequestMeta) {
  await getVendor(id);

  const vendor = await prisma.vendor.update({
    where: { id },
    data: {
      name: input.name,
      address: input.address !== undefined ? input.address || null : undefined,
      productName: input.productName !== undefined ? input.productName || null : undefined,
      gstNumber: input.gstNumber !== undefined ? input.gstNumber || null : undefined,
      email: input.email !== undefined ? input.email || null : undefined,
      phone: input.phone !== undefined ? input.phone || null : undefined,
      contactPerson: input.contactPerson !== undefined ? input.contactPerson || null : undefined,
      bankAccountNumber: input.bankAccountNumber !== undefined ? input.bankAccountNumber || null : undefined,
      bankIfscCode: input.bankIfscCode !== undefined ? input.bankIfscCode || null : undefined,
      active: input.active,
      updatedById: actingUserId,
    },
    include: auditFieldsInclude,
  });

  await recordAuditLog({
    userId: actingUserId,
    action: 'UPDATE',
    module: 'PURCHASE_ORDER',
    status: 'SUCCESS',
    meta,
    details: { vendorId: id, changes: input },
  });

  return vendor;
}

export async function deleteVendor(id: string, actingUserId: string, meta?: RequestMeta) {
  await getVendor(id);

  const poCount = await prisma.purchaseOrder.count({ where: { vendorId: id } });
  if (poCount > 0) {
    throw ApiError.conflict('This vendor has linked Purchase Orders and cannot be deleted. Set it to Inactive instead.');
  }

  await prisma.vendor.delete({ where: { id } });

  await recordAuditLog({
    userId: actingUserId,
    action: 'DELETE',
    module: 'PURCHASE_ORDER',
    status: 'SUCCESS',
    meta,
    details: { vendorId: id },
  });
}
