import { ModuleName } from '@prisma/client';
import { prisma } from '../../config/database';
import { PermissionClaim } from '../../utils/jwt';

export const ALL_MODULES: ModuleName[] = [
  ModuleName.DASHBOARD,
  ModuleName.RECRUITMENT,
  ModuleName.EMPLOYEES,
  ModuleName.ATTENDANCE,
  ModuleName.WAGES,
  ModuleName.COMPLIANCE,
  ModuleName.ADVANCES,
  ModuleName.REPORTS,
  ModuleName.SETTINGS,
  ModuleName.USER_MANAGEMENT,
];

const EMPTY_CLAIM: PermissionClaim = {
  canView: false,
  canAdd: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
};

/// Loads a user's assigned project IDs and full module permission matrix
/// in two indexed queries. Used at login (to build the JWT payload) and by
/// the User Management "view permissions" screen — never duplicated ad-hoc
/// elsewhere so permissions always come from this one source of truth.
export async function getUserAuthProfile(userId: string) {
  const [projectLinks, permissionRows] = await Promise.all([
    prisma.userProject.findMany({
      where: { userId },
      select: { project: { select: { id: true, projectName: true } } },
    }),
    prisma.permission.findMany({ where: { userId } }),
  ]);

  const permissions: Record<string, PermissionClaim> = {};
  for (const mod of ALL_MODULES) {
    permissions[mod] = { ...EMPTY_CLAIM };
  }
  for (const row of permissionRows) {
    permissions[row.module] = {
      canView: row.canView,
      canAdd: row.canAdd,
      canEdit: row.canEdit,
      canDelete: row.canDelete,
      canApprove: row.canApprove,
    };
  }

  return {
    projects: projectLinks.map((p) => p.project),
    permissions,
  };
}
