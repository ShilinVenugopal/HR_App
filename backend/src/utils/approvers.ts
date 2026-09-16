import { ModuleName } from '@prisma/client';
import { prisma } from '../config/database';

/// Approver eligibility is NOT a separate "approval hierarchy" config —
/// it's the existing Permission.canApprove flag on the relevant module,
/// scoped to users assigned to the project (or Super Admin, who is
/// implicitly eligible everywhere). "Super Admin configures the approval
/// hierarchy" means granting canApprove per user in User Management, the
/// same mechanism every other module already uses.
export async function listEligibleApprovers(projectId: string, module: ModuleName) {
  return prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { role: 'SUPER_ADMIN' },
        {
          projects: { some: { projectId } },
          permissions: { some: { module, canApprove: true } },
        },
      ],
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  });
}
