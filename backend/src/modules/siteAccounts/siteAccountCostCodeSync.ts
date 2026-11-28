import { prisma } from '../../config/database';
import { SITE_ACCOUNT_COST_CODES } from './siteAccountCostCodeData';

/// Re-syncs the static SiteAccountCostCode master into the DB on every
/// server start — same reasoning as templateSync.ts's built-in wage
/// templates: without this, a code-only edit to
/// siteAccountCostCodeData.ts would do nothing until someone remembered to
/// re-run `prisma/seed.ts`. Rows are upserted by `code` and never deleted
/// here, so any additional non-static rows a future Super Admin creates
/// through the master editor are left untouched.
export async function syncSiteAccountCostCodes(): Promise<void> {
  for (const row of SITE_ACCOUNT_COST_CODES) {
    await prisma.siteAccountCostCode.upsert({
      where: { code: row.code },
      update: {
        description: row.description,
        parentCode: row.parentCode,
        displayOrder: row.displayOrder,
        hasSubtotal: row.hasSubtotal,
        active: true,
      },
      create: {
        code: row.code,
        description: row.description,
        parentCode: row.parentCode,
        displayOrder: row.displayOrder,
        hasSubtotal: row.hasSubtotal,
      },
    });
  }
}
