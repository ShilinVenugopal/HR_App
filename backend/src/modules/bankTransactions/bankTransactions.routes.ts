import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createManualTransactionSchema, createTransferSchema, idParamSchema, updateTransactionSchema } from './bankTransactions.validation';
import * as controller from './bankTransactions.controller';

const router = Router();
router.use(authenticate);

router.get('/receipts', requirePermission('BANK_ACCOUNTS', 'view'), controller.listReceiptsHandler);
router.get('/payments', requirePermission('BANK_ACCOUNTS', 'view'), controller.listPaymentsHandler);

router.post(
  '/manual',
  requirePermission('BANK_ACCOUNTS', 'add'),
  validate(createManualTransactionSchema),
  controller.createManualTransactionHandler
);
router.post('/transfer', requirePermission('BANK_ACCOUNTS', 'add'), validate(createTransferSchema), controller.createTransferHandler);

router.get('/:id', requirePermission('BANK_ACCOUNTS', 'view'), validate(idParamSchema), controller.getTransactionHandler);
router.put(
  '/:id',
  requirePermission('BANK_ACCOUNTS', 'edit'),
  validate(idParamSchema),
  validate(updateTransactionSchema),
  controller.updateTransactionHandler
);
router.delete('/:id', requirePermission('BANK_ACCOUNTS', 'delete'), validate(idParamSchema), controller.deleteManualTransactionHandler);

export default router;
