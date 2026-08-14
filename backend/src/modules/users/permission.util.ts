import { ModuleName } from '@prisma/client';
import { prisma } from '../../config/database';
import { PermissionClaim } from '../../utils/jwt';

/// Derived directly from the Prisma enum — never hand-list modules here.
/// This list previously hard-coded only 10 of the 18 ModuleName values and
/// silently fell out of sync as new modules (Inventory, Purchase Order,
/// GRN, etc.) were added, which meant getUserDetail()'s permission map
/// (below) dropped any saved permission for the missing modules on every
/// read — so the Permission Matrix appeared to "forget" checks for those
/// modules as soon as the user list/edit screen reloaded, and a subsequent
/// save (full delete+recreate in users.service.ts) would then permanently
/// erase them from the database.
export const ALL_MODULES: ModuleName[] = Object.values(ModuleName);

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
