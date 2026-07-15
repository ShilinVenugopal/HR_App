import { ModuleName } from '@prisma/client';
import { AccessTokenPayload } from '../utils/jwt';
import { RequestMeta } from '../utils/requestMeta';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      meta?: RequestMeta;
      /// Populated by auth/permission/project middleware just before an
      /// authorization failure so the single global audit listener can
      /// write one rich log entry instead of each middleware writing its own.
      auditContext?: {
        module?: ModuleName | null;
        action?: string;
        reason?: string;
        projectId?: string | null;
      };
    }
  }
}

export {};
