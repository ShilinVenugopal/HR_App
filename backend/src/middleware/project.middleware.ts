import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { ApiError } from '../utils/apiError';

/// Returns the set of project IDs a user is allowed to see/write, or the
/// literal string 'ALL' for Super Administrators. Every service that reads
/// or writes an operational (project-scoped) table must call this and fold
/// the result into its Prisma `where` clause — this is the single choke
/// point that guarantees project-based data isolation across the app.
export function getAccessibleProjectIds(req: Request): string[] | 'ALL' {
  const user = req.user;
  if (!user) return [];
  if (user.role === Role.SUPER_ADMIN) return 'ALL';
  return user.projects.map((p) => p.id);
}

/// Builds a Prisma `where` fragment scoping a query to the caller's
/// assigned projects. Pass the field name when it isn't `projectId`
/// (e.g. querying through a relation).
export function projectScopeWhere(req: Request, field = 'projectId') {
  const ids = getAccessibleProjectIds(req);
  if (ids === 'ALL') return {};
  return { [field]: { in: ids } };
}

export function hasProjectAccess(req: Request, projectId: string | null | undefined): boolean {
  const ids = getAccessibleProjectIds(req);
  // Super Admin bypasses project scoping unconditionally — must be checked
  // before the null guard below, otherwise a record with a nullable
  // projectId (e.g. CommunicationMessageLog, when its candidate had no
  // project) incorrectly denies even the Super Admin.
  if (ids === 'ALL') return true;
  if (!projectId) return false;
  return ids.includes(projectId);
}

/// Asserts the caller may operate on the given project, throwing 403
/// otherwise. Call this before any create/update targeting a specific
/// projectId (e.g. from the request body), since URL tampering or a forged
/// payload must never bypass isolation.
export function assertProjectAccess(req: Request, projectId: string | null | undefined) {
  if (hasProjectAccess(req, projectId)) return;

  req.auditContext = {
    projectId: projectId ?? null,
    reason: 'project not assigned to user',
  };

  throw ApiError.forbidden('Access Denied: you are not assigned to this project');
}

/// Route middleware variant for endpoints where the target project comes
/// from the URL, e.g. GET /projects/:projectId/employees.
export function requireProjectParam(paramName = 'projectId') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      assertProjectAccess(req, req.params[paramName]);
      next();
    } catch (err) {
      next(err);
    }
  };
}
