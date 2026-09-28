import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, requireSuperAdmin } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createBillingPaymentSchema,
  createBillingRecordSchema,
  idParamSchema,
  itemIdParamSchema,
  paymentIdParamSchema,
  updateBillingItemSchema,
  updateBillingNotificationSettingsSchema,
  updateBillingPaymentSchema,
  updateBillingRecordSchema,
} from './billingStatus.validation';
import * as billingStatusController from './billingStatus.controller';

const router = Router();
router.use(authenticate);

// Declared before '/:id' so these fixed segments are never matched as a
// billing record id.
// No query validation here — same convention as PR/PO/GRN list routes:
// parsePagination() clamps page/pageSize itself, and filter fields are read
// straight off req.query in the controller.
router.get('/summary', requirePermission('BILLING_STATUS', 'view'), billingStatusController.getBillingSummaryHandler);
router.get('/payment-due-notifications', requirePermission('BILLING_STATUS', 'view'), billingStatusController.getPaymentDueNotificationsHandler);

// Notification settings — viewable by anyone holding BILLING_STATUS view
// (so the frontend can render the section correctly), but only a Super
// Admin may change them; enforced here at the route level, not just hidden
// in the UI.
router.get('/notification-settings', requirePermission('BILLING_STATUS', 'view'), billingStatusController.getNotificationSettingsHandler);
router.patch(
  '/notification-settings',
  requireSuperAdmin,
  validate(updateBillingNotificationSettingsSchema),
  billingStatusController.updateNotificationSettingsHandler
);

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

router.post(
  '/items/:itemId/payments',
  requirePermission('BILLING_STATUS', 'edit'),
  validate(itemIdParamSchema),
  validate(createBillingPaymentSchema),
  billingStatusController.addBillingPaymentHandler
);
router.patch(
  '/payments/:paymentId',
  requirePermission('BILLING_STATUS', 'edit'),
  validate(paymentIdParamSchema),
  validate(updateBillingPaymentSchema),
  billingStatusController.updateBillingPaymentHandler
);
router.delete(
  '/payments/:paymentId',
  requirePermission('BILLING_STATUS', 'delete'),
  validate(paymentIdParamSchema),
  billingStatusController.deleteBillingPaymentHandler
);

export default router;
