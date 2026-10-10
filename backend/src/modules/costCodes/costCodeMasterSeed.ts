import { prisma } from '../../config/database';
import { COST_CODE_MASTER_DATA } from './costCodeMasterData';

/// One-time, create-only import of the reference Cost Code Summary data.
/// Deliberately NOT an upsert and NOT run on server startup (unlike
/// templateSync.ts / siteAccountCostCodeSync.ts's self-healing syncs) —
/// once seeded, this master is meant to be freely add/editable by a Super
/// Admin through the UI, and a boot-time or upsert-based sync would
/// silently clobber those edits on every restart/reseed. Existing codes
/// (whether from the earlier Procurement seed block above or a Super
/// Admin's own edits) are left completely untouched; only genuinely new
/// codes are inserted.
export async function seedCostCodeMasterData(): Promise<void> {
  const existingCodes = new Set((await prisma.costCode.findMany({ select: { code: true } })).map((c) => c.code));
  const toCreate = COST_CODE_MASTER_DATA.filter((row) => !existingCodes.has(row.code));
  if (!toCreate.length) return;

  await prisma.costCode.createMany({
    data: toCreate.map((row) => ({
      code: row.code,
      name: row.description,
      itemsToConsider: row.itemsToConsider,
      remarks: row.remarks,
      responsiblePerson: row.responsiblePerson,
    })),
  });
}
