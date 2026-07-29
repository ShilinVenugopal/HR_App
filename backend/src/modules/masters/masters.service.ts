import { ProjectStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

type MasterEntity = 'department' | 'designation' | 'costCode';

interface MasterDelegate {
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  findUnique: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
}

const LABEL: Record<MasterEntity, string> = { department: 'Department', designation: 'Designation', costCode: 'Cost Code' };

/// Departments, Designations and Cost Codes are structurally near-identical
/// master-data tables, so one generic service backs all three REST
/// resources instead of duplicating CRUD blocks. Cost Codes are the one
/// entity keyed by a separate `code` field (e.g. "F05A") rather than
/// `name` — everything else about them is identical.
function delegateFor(entity: MasterEntity): MasterDelegate {
  if (entity === 'department') return prisma.department as unknown as MasterDelegate;
  if (entity === 'designation') return prisma.designation as unknown as MasterDelegate;
  return prisma.costCode as unknown as MasterDelegate;
}

function uniqueKeyField(entity: MasterEntity): 'name' | 'code' {
  return entity === 'costCode' ? 'code' : 'name';
}

export async function listMasters(entity: MasterEntity, pagination: PaginationParams) {
  const delegate = delegateFor(entity);
  const where = pagination.search
    ? entity === 'costCode'
      ? { OR: [{ name: { contains: pagination.search, mode: 'insensitive' } }, { code: { contains: pagination.search, mode: 'insensitive' } }] }
      : { name: { contains: pagination.search, mode: 'insensitive' } }
    : {};

  const [rows, total] = await Promise.all([
    delegate.findMany({
      where,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? uniqueKeyField(entity)]: pagination.sortOrder },
    }),
    delegate.count({ where }),
  ]);

  return { rows, total };
}

export async function createMaster(
  entity: MasterEntity,
  input: { code?: string; name: string; status?: ProjectStatus },
  actingUserId: string,
  meta?: RequestMeta
) {
  const delegate = delegateFor(entity);
  const keyField = uniqueKeyField(entity);
  if (keyField === 'code' && !input.code) throw ApiError.badRequest('Code is required');
  const keyValue = keyField === 'code' ? input.code : input.name;

  const existing = await delegate.findUnique({ where: { [keyField]: keyValue } });
  if (existing) throw ApiError.conflict(`${LABEL[entity]} "${keyValue}" already exists`);

  const data = entity === 'costCode' ? { code: input.code, name: input.name, status: input.status } : { name: input.name, status: input.status };
  const row = await delegate.create({ data });
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
  input: { code?: string; name?: string; status?: ProjectStatus },
  actingUserId: string,
  meta?: RequestMeta
) {
  const delegate = delegateFor(entity);
  const existing = await delegate.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound(`${LABEL[entity]} not found`);

  const data = entity === 'costCode' ? { code: input.code, name: input.name, status: input.status } : { name: input.name, status: input.status };
  const row = await delegate.update({ where: { id }, data });
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
