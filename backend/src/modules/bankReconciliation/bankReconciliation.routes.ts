import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { generateStatementSchema, saveReconciliationSchema } from './bankReconciliation.validation';
import * as controller from './bankReconciliation.controller';

const router = Router();
router.use(authenticate);

router.get('/history', requirePermission('BANK_ACCOUNTS', 'view'), controller.listHistoryHandler);
router.post('/generate', requirePermission('BANK_ACCOUNTS', 'view'), validate(generateStatementSchema), controller.generateStatementHandler);
router.post('/save', requirePermission('BANK_ACCOUNTS', 'add'), validate(saveReconciliationSchema), controller.saveReconciliationHandler);

export default router;
