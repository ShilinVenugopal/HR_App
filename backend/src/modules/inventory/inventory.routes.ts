import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { bulkImportSchema, checkDuplicatesSchema, createInventorySchema, idParamSchema, updateInventorySchema } from './inventory.validation';
import * as inventoryController from './inventory.controller';

const router = Router();
router.use(authenticate);

// Bulk import (Excel) — declared before '/:id' so 'bulk' is never matched
// as an inventory item id.
router.post(
  '/bulk/check-duplicates',
  requirePermission('INVENTORY', 'add'),
  validate(checkDuplicatesSchema),
  inventoryController.checkDuplicatesHandler
);
router.post('/bulk/import', requirePermission('INVENTORY', 'add'), validate(bulkImportSchema), inventoryController.bulkImportHandler);

router.get('/', requirePermission('INVENTORY', 'view'), inventoryController.listInventoryHandler);
router.get('/:id', requirePermission('INVENTORY', 'view'), validate(idParamSchema), inventoryController.getInventoryHandler);
router.post('/', requirePermission('INVENTORY', 'add'), validate(createInventorySchema), inventoryController.createInventoryHandler);
router.put(
  '/:id',
  requirePermission('INVENTORY', 'edit'),
  validate(idParamSchema),
  validate(updateInventorySchema),
  inventoryController.updateInventoryHandler
);
router.delete('/:id', requirePermission('INVENTORY', 'delete'), validate(idParamSchema), inventoryController.deleteInventoryHandler);

export default router;
