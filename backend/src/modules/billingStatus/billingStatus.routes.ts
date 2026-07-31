import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createBillingRecordSchema,
  idParamSchema,
  itemIdParamSchema,
  updateBillingItemSchema,
  updateBillingRecordSchema,
} from './billingStatus.validation';
import * as billingStatusController from './billingStatus.controller';

const router = Router();
router.use(authenticate);

// Declared before '/:id' so 'summary' is never matched as a billing record id.
// No query validation here — same convention as PR/PO/GRN list routes:
// parsePagination() clamps page/pageSize itself, and filter fields are read
// straight off req.query in the controller.
router.get('/summary', requirePermission('BILLING_STATUS', 'view'), billingStatusController.getBillingSummaryHandler);

router.get('/', requirePermission('BILLING_STATUS', 'view'), billingStatusController.listBillingItemsHandler);
router.get('/:id', requirePermission('BILLING_STATUS', 'view'), validate(idParamSchema), billingStatusController.getBillingRecordHandler);
router.post(
  '/',
  requirePermission('BILLING_STATUS', 'add'),
  validate(createBillingRecordSchema),
  billingStatusController.createBillingRecordHandler
);
router.patch(
  '/:id',
  requirePermission('BILLING_STATUS', 'edit'),
  validate(idParamSchema),
  validate(updateBillingRecordSchema),
  billingStatusController.updateBillingRecordHandler
);
router.delete('/:id', requirePermission('BILLING_STATUS', 'delete'), validate(idParamSchema), billingStatusController.deleteBillingRecordHandler);

router.patch(
  '/items/:itemId',
  requirePermission('BILLING_STATUS', 'edit'),
  validate(itemIdParamSchema),
  validate(updateBillingItemSchema),
  billingStatusController.updateBillingItemHandler
);
router.delete(
  '/items/:itemId',
  requirePermission('BILLING_STATUS', 'delete'),
  validate(itemIdParamSchema),
  billingStatusController.deleteBillingItemHandler
);

export default router;
