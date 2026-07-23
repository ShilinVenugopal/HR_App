import { ProjectStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

type MasterEntity = 'department' | 'designation';

interface MasterDelegate {
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  findUnique: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
}

const LABEL: Record<MasterEntity, string> = { department: 'Department', designation: 'Designation' };

/// Departments and Designations are structurally identical master-data
/// tables (name + status), so a single generic service backs both REST
/// resources instead of duplicating four near-identical CRUD blocks.
function delegateFor(entity: MasterEntity): MasterDelegate {
  return entity === 'department' ? (prisma.department as unknown as MasterDelegate) : (prisma.designation as unknown as MasterDelegate);
}

export async function listMasters(entity: MasterEntity, pagination: PaginationParams) {
  const delegate = delegateFor(entity);
  const where = pagination.search ? { name: { contains: pagination.search, mode: 'insensitive' } } : {};

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

export async function createMaster(
  entity: MasterEntity,
  input: { name: string; status?: ProjectStatus },
  actingUserId: string,
  meta?: RequestMeta
) {
  const delegate = delegateFor(entity);
  const existing = await delegate.findUnique({ where: { name: input.name } });
  if (existing) throw ApiError.conflict(`${LABEL[entity]} "${input.name}" already exists`);

  const row = await delegate.create({ data: input });
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

  const row = await delegate.update({ where: { id }, data: input });
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
