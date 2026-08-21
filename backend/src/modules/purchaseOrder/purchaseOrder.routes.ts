import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, requireSuperAdmin } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  approversQuerySchema,
  createPoSchema,
  decidePoSchema,
  idParamSchema,
  rejectPoSchema,
  submitPoSchema,
  updatePoSchema,
  updatePoSettingsSchema,
} from './purchaseOrder.validation';
import * as poController from './purchaseOrder.controller';

const router = Router();
router.use(authenticate);

// Declared before '/:id' so 'approvers' is never matched as a PO id.
router.get('/approvers', requirePermission('PURCHASE_ORDER', 'view'), validate(approversQuerySchema), poController.listApproversHandler);

router.get('/', requirePermission('PURCHASE_ORDER', 'view'), poController.listPoHandler);
router.get('/:id', requirePermission('PURCHASE_ORDER', 'view'), validate(idParamSchema), poController.getPoHandler);
router.post('/', requirePermission('PURCHASE_ORDER', 'add'), validate(createPoSchema), poController.createPoHandler);
router.put(
  '/:id',
  requirePermission('PURCHASE_ORDER', 'edit'),
  validate(idParamSchema),
  validate(updatePoSchema),
  poController.updatePoHandler
);
router.delete('/:id', requirePermission('PURCHASE_ORDER', 'delete'), validate(idParamSchema), poController.deletePoHandler);

router.post(
  '/:id/submit',
  requirePermission('PURCHASE_ORDER', 'edit'),
  validate(idParamSchema),
  validate(submitPoSchema),
  poController.submitPoHandler
);
router.post(
  '/:id/approve',
  requirePermission('PURCHASE_ORDER', 'approve'),
  validate(idParamSchema),
  validate(decidePoSchema),
  poController.approvePoHandler
);
router.post(
  '/:id/reject',
  requirePermission('PURCHASE_ORDER', 'approve'),
  validate(idParamSchema),
  validate(rejectPoSchema),
  poController.rejectPoHandler
);
router.patch('/:id/unlock', requireSuperAdmin, validate(idParamSchema), poController.unlockPoHandler);
router.patch(
  '/:id/settings',
  requireSuperAdmin,
  validate(idParamSchema),
  validate(updatePoSettingsSchema),
  poController.updatePoSettingsHandler
);

export default router;
