import { prisma } from '../../config/database';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

export async function listPoTerms() {
  return prisma.purchaseOrderTerm.findMany({ orderBy: { sortOrder: 'asc' } });
}

export interface PoTermItemInput {
  heading: string;
  body: string;
}

/// Replaces the entire template in one transaction — old rows are
/// dropped and the new ordered list is inserted with fresh ids. This only
/// changes what *future* Purchase Orders snapshot at creation; POs
/// created before this call keep whatever they already snapshotted into
/// their own `termsAndConditions` column, untouched.
export async function replacePoTerms(items: PoTermItemInput[], actingUserId: string, meta?: RequestMeta) {
  const terms = await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderTerm.deleteMany({});
    await tx.purchaseOrderTerm.createMany({
      data: items.map((item, index) => ({
        heading: item.heading,
        body: item.body,
        sortOrder: index,
        updatedById: actingUserId,
      })),
    });
    return tx.purchaseOrderTerm.findMany({ orderBy: { sortOrder: 'asc' } });
  });

  await recordAuditLog({
    userId: actingUserId,
    action: 'UPDATE',
    module: 'PURCHASE_ORDER',
    status: 'SUCCESS',
    meta,
    details: { termsCount: terms.length, action: 'replace-po-terms-template' },
  });

  return terms;
}
