import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireSuperAdmin } from '../../middleware/permission.middleware';
import { listAuditLogsHandler } from './auditLog.controller';

const router = Router();

// Audit Logs are a Super Administrator capability.
router.use(authenticate, requireSuperAdmin);
router.get('/', listAuditLogsHandler);

export default router;
