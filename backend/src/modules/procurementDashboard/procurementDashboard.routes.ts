import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { getProcurementDashboardHandler } from './procurementDashboard.controller';

const router = Router();
router.use(authenticate, requirePermission('PROCUREMENT_DASHBOARD', 'view'));

router.get('/summary', getProcurementDashboardHandler);

export default router;
