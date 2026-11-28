import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createVendorSchema, idParamSchema, updateVendorSchema } from './vendors.validation';
import * as vendorsController from './vendors.controller';

const router = Router();
router.use(authenticate);

// Reference data: any authenticated user may read it — the PO form needs
// the vendor dropdown regardless of whether the user also holds
// PURCHASE_ORDER write permission. Writes are gated by the permission
// matrix, same as every other module.
router.get('/', vendorsController.listVendorsHandler);
router.get('/check-duplicate', vendorsController.checkDuplicateVendorHandler);
router.get('/:id', validate(idParamSchema), vendorsController.getVendorHandler);
router.post('/', requirePermission('PURCHASE_ORDER', 'add'), validate(createVendorSchema), vendorsController.createVendorHandler);
router.put(
  '/:id',
  requirePermission('PURCHASE_ORDER', 'edit'),
  validate(idParamSchema),
  validate(updateVendorSchema),
  vendorsController.updateVendorHandler
);
router.delete('/:id', requirePermission('PURCHASE_ORDER', 'delete'), validate(idParamSchema), vendorsController.deleteVendorHandler);

export default router;
