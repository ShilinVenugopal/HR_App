import { ProjectStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

type MasterEntity = 'department' | 'designation' | 'ticketCategory';

interface MasterDelegate {
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  findUnique: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
}

const LABEL: Record<MasterEntity, string> = { department: 'Department', designation: 'Designation', ticketCategory: 'Ticket Category' };

/// Departments, Designations, and Ticket Categories are structurally
/// identical master-data tables, so one generic service backs all three
/// REST resources instead of duplicating CRUD blocks. Cost Codes used to be
/// a fourth entity here, but graduated into its own dedicated module
/// (backend/src/modules/costCodes) once its requirements diverged — Super-
/// Admin-only mutations instead of the SETTINGS permission matrix, plus
/// extra fields the others don't have — rather than bending this generic
/// pattern to fit both.
function delegateFor(entity: MasterEntity): MasterDelegate {
  if (entity === 'department') return prisma.department as unknown as MasterDelegate;
  if (entity === 'designation') return prisma.designation as unknown as MasterDelegate;
  return prisma.ticketCategory as unknown as MasterDelegate;
}

export async function listMasters(entity: MasterEntity, pagination: PaginationParams, status?: ProjectStatus) {
  const delegate = delegateFor(entity);
  const where = {
    ...(pagination.search ? { name: { contains: pagination.search, mode: 'insensitive' } } : {}),
    ...(status ? { status } : {}),
  };

  const [rows, total] = await Promise.all([
    delegate.findMany({
      where,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'name']: pagination.sortOrder },
    }),
    delegate.count({ where }),
  ]);

  return { rows, total };
}

export async function createMaster(entity: MasterEntity, input: { name: string; status?: ProjectStatus }, actingUserId: string, meta?: RequestMeta) {
  const delegate = delegateFor(entity);

  const existing = await delegate.findUnique({ where: { name: input.name } });
  if (existing) throw ApiError.conflict(`${LABEL[entity]} "${input.name}" already exists`);

  const row = await delegate.create({ data: { name: input.name, status: input.status } });
  await recordAuditLog({
    userId: actingUserId,
    action: 'CREATE',
    module: 'SETTINGS',
    status: 'SUCCESS',
    meta,
    details: { entity, name: row.name },
  });
  return row;
}

export async function updateMaster(
  entity: MasterEntity,
  id: string,
  input: { name?: string; status?: ProjectStatus },
  actingUserId: string,
  meta?: RequestMeta
) {
  const delegate = delegateFor(entity);
  const existing = await delegate.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound(`${LABEL[entity]} not found`);

  const row = await delegate.update({ where: { id }, data: { name: input.name, status: input.status } });
  await recordAuditLog({
    userId: actingUserId,
    action: 'UPDATE',
    module: 'SETTINGS',
    status: 'SUCCESS',
    meta,
    details: { entity, id, changes: input },
  });
  return row;
}

export async function deleteMaster(entity: MasterEntity, id: string, actingUserId: string, meta?: RequestMeta) {
  const delegate = delegateFor(entity);
  const existing = await delegate.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound(`${LABEL[entity]} not found`);

  await delegate.delete({ where: { id } });
  await recordAuditLog({
    userId: actingUserId,
    action: 'DELETE',
    module: 'SETTINGS',
    status: 'SUCCESS',
    meta,
    details: { entity, id },
  });
}
