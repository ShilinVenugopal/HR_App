import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { getDashboardHandler } from './dashboard.controller';

const router = Router();
router.use(authenticate, requirePermission('DASHBOARD', 'view'));

router.get('/summary', getDashboardHandler);

export default router;
