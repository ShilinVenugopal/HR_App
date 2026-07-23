import { NextFunction, Request, Response } from 'express';
import { ModuleName, Role } from '@prisma/client';
import { ApiError } from '../utils/apiError';

export type PermissionAction = 'view' | 'add' | 'edit' | 'delete' | 'approve';

const ACTION_TO_CLAIM: Record<PermissionAction, string> = {
  view: 'canView',
  add: 'canAdd',
  edit: 'canEdit',
  delete: 'canDelete',
  approve: 'canApprove',
};

/// Module-wise + CRUD permission middleware. This is the backend's final
/// authority — the frontend hiding a button is UX only, this is security.
/// Super Administrators bypass the permission matrix entirely (unrestricted
/// access per role definition). Every other role must have an explicit
/// Permission row for the module with the requested action flag set.
export function requirePermission(module: ModuleName, action: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(ApiError.unauthorized());

    if (user.role === Role.SUPER_ADMIN) return next();

    const claim = user.permissions[module];
    const claimKey = ACTION_TO_CLAIM[action] as keyof typeof claim;

    if (!claim || !claim[claimKey]) {
      req.auditContext = { module, action, reason: 'missing module/CRUD permission' };
      return next(ApiError.forbidden('Access Denied'));
    }

    next();
  };
}

/// Some areas (User Management, full system settings) are reserved for
/// Super Administrators regardless of any configured permission matrix.
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) return next(ApiError.unauthorized());
  if (user.role !== Role.SUPER_ADMIN) {
    req.auditContext = { module: ModuleName.USER_MANAGEMENT, reason: 'super admin only route' };
    return next(ApiError.forbidden('Access Denied'));
  }
  next();
}

export function requireAnyRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(ApiError.unauthorized());
    if (!roles.includes(user.role)) {
      req.auditContext = { reason: `requires role in [${roles.join(', ')}]` };
      return next(ApiError.forbidden('Access Denied'));
    }
    next();
  };
}
