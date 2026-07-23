import { Prisma, Role, UserStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { hashPassword } from '../../utils/password';
import { PaginationParams } from '../../utils/pagination';
import { ALL_MODULES } from './permission.util';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const userListSelect = {
  id: true,
  name: true,
  email: true,
  mobile: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  projects: { select: { project: { select: { id: true, projectName: true } } } },
} satisfies Prisma.UserSelect;

export async function listUsers(pagination: PaginationParams) {
  const where: Prisma.UserWhereInput = pagination.search
    ? {
        OR: [
          { name: { contains: pagination.search, mode: 'insensitive' } },
          { email: { contains: pagination.search, mode: 'insensitive' } },
          { mobile: { contains: pagination.search, mode: 'insensitive' } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userListSelect,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { [pagination.sortBy ?? 'createdAt']: pagination.sortOrder },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    rows: rows.map((u) => ({
      ...u,
      projects: u.projects.map((p) => p.project),
    })),
    total,
  };
}

export async function getUserDetail(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...userListSelect,
      mustResetPassword: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!user) throw ApiError.notFound('User not found');

  const permissions = await prisma.permission.findMany({ where: { userId: id } });
  const permissionMap = Object.fromEntries(ALL_MODULES.map((m) => [m, permissions.find((p) => p.module === m) ?? {
    module: m,
    canView: false,
    canAdd: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
  }]));

  return {
    ...user,
    projects: user.projects.map((p) => p.project),
    permissions: permissionMap,
  };
}

interface PermissionInput {
  module: string;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

export interface CreateUserInput {
  name: string;
  email: string;
  mobile: string;
  password: string;
  role: Role;
  status: UserStatus;
  projectIds: string[];
  permissions: PermissionInput[];
}

async function assertNotLastSuperAdmin(userId: string, action: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== Role.SUPER_ADMIN) return;

  const activeSuperAdmins = await prisma.user.count({
    where: { role: Role.SUPER_ADMIN, status: UserStatus.ACTIVE, id: { not: userId } },
  });
  if (activeSuperAdmins === 0) {
    throw ApiError.badRequest(`Cannot ${action} the last active Super Administrator`);
  }
}

export async function createUser(input: CreateUserInput, createdById: string, meta?: RequestMeta) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict('A user with this email already exists');

  if (input.projectIds.length) {
    const validProjects = await prisma.project.count({ where: { id: { in: input.projectIds } } });
    if (validProjects !== input.projectIds.length) {
      throw ApiError.badRequest('One or more selected projects do not exist');
    }
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        mobile: input.mobile,
        passwordHash,
        role: input.role,
        status: input.status,
        createdById,
      },
    });

    if (input.projectIds.length) {
      await tx.userProject.createMany({
        data: input.projectIds.map((projectId) => ({ userId: created.id, projectId })),
      });
    }

    if (input.permissions.length) {
      await tx.permission.createMany({
        data: input.permissions.map((p) => ({
          userId: created.id,
          module: p.module as any,
          canView: p.canView,
          canAdd: p.canAdd,
          canEdit: p.canEdit,
          canDelete: p.canDelete,
          canApprove: p.canApprove,
        })),
      });
    }

    return created;
  });

  await recordAuditLog({
    userId: createdById,
    action: 'CREATE',
    module: 'USER_MANAGEMENT',
    status: 'SUCCESS',
    meta,
    details: { targetUserId: user.id, targetEmail: user.email },
  });

  return getUserDetail(user.id);
}

export interface UpdateUserInput {
  name?: string;
  mobile?: string;
  role?: Role;
  status?: UserStatus;
  projectIds?: string[];
  permissions?: PermissionInput[];
}

export async function updateUser(id: string, input: UpdateUserInput, actingUserId: string, meta?: RequestMeta) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('User not found');

  if (input.role && input.role !== Role.SUPER_ADMIN && existing.role === Role.SUPER_ADMIN) {
    await assertNotLastSuperAdmin(id, 'change the role of');
  }
  if (input.status === UserStatus.DISABLED) {
    await assertNotLastSuperAdmin(id, 'disable');
  }

  if (input.projectIds) {
    if (input.projectIds.length) {
      const validProjects = await prisma.project.count({ where: { id: { in: input.projectIds } } });
      if (validProjects !== input.projectIds.length) {
        throw ApiError.badRequest('One or more selected projects do not exist');
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        name: input.name,
        mobile: input.mobile,
        role: input.role,
        status: input.status,
      },
    });

    if (input.projectIds) {
      await tx.userProject.deleteMany({ where: { userId: id } });
      if (input.projectIds.length) {
        await tx.userProject.createMany({
          data: input.projectIds.map((projectId) => ({ userId: id, projectId })),
        });
      }
    }

    if (input.permissions) {
      await tx.permission.deleteMany({ where: { userId: id } });
      if (input.permissions.length) {
        await tx.permission.createMany({
          data: input.permissions.map((p) => ({
            userId: id,
            module: p.module as any,
            canView: p.canView,
            canAdd: p.canAdd,
            canEdit: p.canEdit,
            canDelete: p.canDelete,
            canApprove: p.canApprove,
          })),
        });
      }
    }

    // Revoke sessions so role/project/permission changes take effect on
    // next login/refresh rather than lingering in an already-issued token.
    if (input.role || input.status || input.projectIds || input.permissions) {
      await tx.refreshToken.updateMany({ where: { userId: id, revoked: false }, data: { revoked: true } });
    }
  });

  await recordAuditLog({
    userId: actingUserId,
    action: 'UPDATE',
    module: 'USER_MANAGEMENT',
    status: 'SUCCESS',
    meta,
    details: { targetUserId: id, changes: input },
  });

  return getUserDetail(id);
}

export async function setUserStatus(id: string, status: UserStatus, actingUserId: string, meta?: RequestMeta) {
  return updateUser(id, { status }, actingUserId, meta);
}

export async function resetUserPassword(id: string, newPassword: string, actingUserId: string, meta?: RequestMeta) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound('User not found');

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash, mustResetPassword: true } }),
    prisma.refreshToken.updateMany({ where: { userId: id, revoked: false }, data: { revoked: true } }),
  ]);

  await recordAuditLog({
    userId: actingUserId,
    action: 'PASSWORD_RESET',
    module: 'USER_MANAGEMENT',
    status: 'SUCCESS',
    meta,
    details: { targetUserId: id },
  });
}

export async function deleteUser(id: string, actingUserId: string, meta?: RequestMeta) {
  if (id === actingUserId) throw ApiError.badRequest('You cannot delete your own account');

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound('User not found');

  await assertNotLastSuperAdmin(id, 'delete');

  await prisma.user.delete({ where: { id } });

  await recordAuditLog({
    userId: actingUserId,
    action: 'DELETE',
    module: 'USER_MANAGEMENT',
    status: 'SUCCESS',
    meta,
    details: { targetUserId: id, targetEmail: user.email },
  });
}
