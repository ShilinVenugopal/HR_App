import { NextFunction, Request, Response } from 'express';
import { recordAuditLog } from '../modules/auditLogs/auditLog.service';
import { extractRequestMeta } from '../utils/requestMeta';

/// Global audit middleware — the single place unauthorized attempts are
/// written. Auth/permission/project middleware never write to the audit
/// log directly; they just stash context on `req.auditContext` before
/// failing, and this listener (attached once, globally, in app.ts) turns
/// any 401/403 response into one rich audit trail row on the way out.
export function auditUnauthorizedResponses(req: Request, res: Response, next: NextFunction) {
  req.meta = req.meta ?? extractRequestMeta(req);

  res.on('finish', () => {
    if (res.statusCode === 401 || res.statusCode === 403) {
      void recordAuditLog({
        userId: req.user?.sub,
        userEmail: req.user?.email,
        action: 'UNAUTHORIZED_ACCESS',
        module: req.auditContext?.module ?? null,
        projectId: req.auditContext?.projectId ?? null,
        status: 'FAILURE',
        meta: req.meta,
        details: {
          path: req.originalUrl,
          method: req.method,
          statusCode: res.statusCode,
          reason: req.auditContext?.reason,
          action: req.auditContext?.action,
        },
      });
    }
  });

  next();
}
