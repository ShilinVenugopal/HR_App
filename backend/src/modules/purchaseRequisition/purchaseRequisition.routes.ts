import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, requireSuperAdmin } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  approversQuerySchema,
  createPrSchema,
  decidePrSchema,
  idParamSchema,
  rejectOrReturnPrSchema,
  submitPrSchema,
  updatePrSchema,
} from './purchaseRequisition.validation';
import * as prController from './purchaseRequisition.controller';

const router = Router();
router.use(authenticate);

// Declared before '/:id' so 'approvers' is never matched as a PR id.
router.get(
  '/approvers',
  requirePermission('PURCHASE_REQUISITION', 'view'),
  validate(approversQuerySchema),
  prController.listApproversHandler
);

router.get('/', requirePermission('PURCHASE_REQUISITION', 'view'), prController.listPrHandler);
router.get('/:id', requirePermission('PURCHASE_REQUISITION', 'view'), validate(idParamSchema), prController.getPrHandler);
router.post('/', requirePermission('PURCHASE_REQUISITION', 'add'), validate(createPrSchema), prController.createPrHandler);
router.put(
  '/:id',
  requirePermission('PURCHASE_REQUISITION', 'edit'),
  validate(idParamSchema),
  validate(updatePrSchema),
  prController.updatePrHandler
);
router.delete('/:id', requirePermission('PURCHASE_REQUISITION', 'delete'), validate(idParamSchema), prController.deletePrHandler);

router.post(
  '/:id/submit',
  requirePermission('PURCHASE_REQUISITION', 'edit'),
  validate(idParamSchema),
  validate(submitPrSchema),
  prController.submitPrHandler
);
router.post(
  '/:id/approve',
  requirePermission('PURCHASE_REQUISITION', 'approve'),
  validate(idParamSchema),
  validate(decidePrSchema),
  prController.approvePrHandler
);
router.post(
  '/:id/reject',
  requirePermission('PURCHASE_REQUISITION', 'approve'),
  validate(idParamSchema),
  validate(rejectOrReturnPrSchema),
  prController.rejectPrHandler
);
router.post(
  '/:id/return',
  requirePermission('PURCHASE_REQUISITION', 'approve'),
  validate(idParamSchema),
  validate(rejectOrReturnPrSchema),
  prController.returnPrHandler
);
router.patch('/:id/unlock', requireSuperAdmin, validate(idParamSchema), prController.unlockPrHandler);

export default router;
