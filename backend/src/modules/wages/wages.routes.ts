import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createWageSchema, idParamSchema, updateWageSchema } from './wages.validation';
import * as wagesController from './wages.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('WAGES', 'view'), wagesController.listWagesHandler);
router.get('/:id', requirePermission('WAGES', 'view'), validate(idParamSchema), wagesController.getWageHandler);
router.post('/', requirePermission('WAGES', 'add'), validate(createWageSchema), wagesController.createWageHandler);
router.put(
  '/:id',
  requirePermission('WAGES', 'edit'),
  validate(idParamSchema),
  validate(updateWageSchema),
  wagesController.updateWageHandler
);
router.delete('/:id', requirePermission('WAGES', 'delete'), validate(idParamSchema), wagesController.deleteWageHandler);
router.patch('/:id/approve', requirePermission('WAGES', 'approve'), validate(idParamSchema), wagesController.approveWageHandler);
router.patch('/:id/mark-paid', requirePermission('WAGES', 'approve'), validate(idParamSchema), wagesController.markWagePaidHandler);

export default router;
