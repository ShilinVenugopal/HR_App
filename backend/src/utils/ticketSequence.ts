import { prisma } from '../config/database';

/// Atomically allocates the next TKT-000001-style ticket number from the
/// single-row TicketSequence counter. Same upsert+increment pattern as
/// utils/documentSequence.ts (compiles to one INSERT ... ON CONFLICT DO
/// UPDATE), so concurrent ticket creation can never be handed the same
/// number — deliberately not SELECT COUNT(*) + 1, which races under
/// concurrent submissions.
export async function nextTicketNumber(): Promise<string> {
  const seq = await prisma.ticketSequence.upsert({
    where: { id: 1 },
    update: { lastNumber: { increment: 1 } },
    create: { id: 1, lastNumber: 1 },
  });
  return `TKT-${String(seq.lastNumber).padStart(6, '0')}`;
}
