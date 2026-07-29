import { ProcurementDocType } from '@prisma/client';
import { prisma } from '../config/database';

const PREFIX: Record<ProcurementDocType, string> = { PR: 'PR', PO: 'PO', GRN: 'GRN' };

/// Atomically allocates the next document number for a project + doc type
/// (backend/prisma/schema.prisma's DocumentSequence model). The upsert's
/// `increment` compiles to a single `INSERT ... ON CONFLICT DO UPDATE`
/// statement, so concurrent requests for the same project can never be
/// handed the same number — no read-then-write race.
export async function nextDocumentNumber(projectId: string, type: ProcurementDocType): Promise<string> {
  const seq = await prisma.documentSequence.upsert({
    where: { projectId_type: { projectId, type } },
    update: { lastNumber: { increment: 1 } },
    create: { projectId, type, lastNumber: 1 },
  });
  return `${PREFIX[type]}-${String(seq.lastNumber).padStart(4, '0')}`;
}
