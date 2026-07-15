import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createAdvanceSchema, idParamSchema, recoverySchema, updateAdvanceSchema } from './advances.validation';
import * as advancesController from './advances.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('ADVANCES', 'view'), advancesController.listAdvancesHandler);
router.get('/:id', requirePermission('ADVANCES', 'view'), validate(idParamSchema), advancesController.getAdvanceHandler);
router.post('/', requirePermission('ADVANCES', 'add'), validate(createAdvanceSchema), advancesController.createAdvanceHandler);
router.put(
  '/:id',
  requirePermission('ADVANCES', 'edit'),
  validate(idParamSchema),
  validate(updateAdvanceSchema),
  advancesController.updateAdvanceHandler
);
router.delete('/:id', requirePermission('ADVANCES', 'delete'), validate(idParamSchema), advancesController.deleteAdvanceHandler);
router.patch('/:id/approve', requirePermission('ADVANCES', 'approve'), validate(idParamSchema), advancesController.approveAdvanceHandler);
router.patch('/:id/reject', requirePermission('ADVANCES', 'approve'), validate(idParamSchema), advancesController.rejectAdvanceHandler);
router.post(
  '/:id/recoveries',
  requirePermission('ADVANCES', 'edit'),
  validate(idParamSchema),
  validate(recoverySchema),
  advancesController.addRecoveryHandler
);

export default router;
