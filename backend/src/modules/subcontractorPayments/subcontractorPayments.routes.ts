import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createPaymentTransactionSchema,
  createSubcontractorBillSchema,
  idParamSchema,
  paymentIdParamSchema,
  updatePaymentTransactionSchema,
  updateSubcontractorBillSchema,
} from './subcontractorPayments.validation';
import * as controller from './subcontractorPayments.controller';

const router = Router();
router.use(authenticate);

// Fixed segments declared before '/:id' so they're never matched as a bill id.
router.get('/totals', requirePermission('SUBCONTRACTORS', 'view'), controller.getBillTotalsHandler);
router.get('/payment-due', requirePermission('SUBCONTRACTORS', 'view'), controller.getPaymentDueHandler);

router.get('/', requirePermission('SUBCONTRACTORS', 'view'), controller.listBillsHandler);
router.get('/:id', requirePermission('SUBCONTRACTORS', 'view'), validate(idParamSchema), controller.getBillHandler);
router.post('/', requirePermission('SUBCONTRACTORS', 'add'), validate(createSubcontractorBillSchema), controller.createBillHandler);
router.put(
  '/:id',
  requirePermission('SUBCONTRACTORS', 'edit'),
  validate(idParamSchema),
  validate(updateSubcontractorBillSchema),
  controller.updateBillHandler
);
router.delete('/:id', requirePermission('SUBCONTRACTORS', 'delete'), validate(idParamSchema), controller.deleteBillHandler);

router.post(
  '/:id/payments',
  requirePermission('SUBCONTRACTORS', 'edit'),
  validate(idParamSchema),
  validate(createPaymentTransactionSchema),
  controller.addPaymentHandler
);
router.patch(
  '/payments/:paymentId',
  requirePermission('SUBCONTRACTORS', 'edit'),
  validate(paymentIdParamSchema),
  validate(updatePaymentTransactionSchema),
  controller.updatePaymentHandler
);
router.delete(
  '/payments/:paymentId',
  requirePermission('SUBCONTRACTORS', 'delete'),
  validate(paymentIdParamSchema),
  controller.deletePaymentHandler
);

export default router;
