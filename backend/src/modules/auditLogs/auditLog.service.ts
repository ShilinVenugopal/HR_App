import { AuditAction, AuditStatus, ModuleName } from '@prisma/client';
import { prisma } from '../../config/database';
import { RequestMeta } from '../../utils/requestMeta';

export interface AuditLogInput {
  userId?: string | null;
  userEmail?: string | null;
  action: AuditAction;
  module?: ModuleName | null;
  projectId?: string | null;
  status: AuditStatus;
  details?: Record<string, unknown>;
  meta?: RequestMeta;
}

/// Fire-and-forget audit write — logging must never block or fail the
/// primary request, so errors here are swallowed after being logged to stderr.
export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        userEmail: input.userEmail ?? null,
        action: input.action,
        module: input.module ?? null,
        projectId: input.projectId ?? null,
        status: input.status,
        details: input.details ? (input.details as any) : undefined,
        ipAddress: input.meta?.ipAddress,
        device: input.meta?.device,
        browser: input.meta?.browser,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to record audit log', err);
  }
}
