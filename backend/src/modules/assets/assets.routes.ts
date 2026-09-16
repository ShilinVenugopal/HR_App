import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { bulkImportSchema, createAssetSchema, idParamSchema, updateAssetSchema } from './assets.validation';
import * as assetsController from './assets.controller';

const router = Router();
router.use(authenticate);

// Bulk import (Excel) — declared before '/:id' so 'bulk' is never matched
// as an asset id. Import is gated by the same 'add' action as manual
// entry, matching the existing Inventory bulk-import pattern.
router.post('/bulk/import', requirePermission('ASSETS', 'add'), validate(bulkImportSchema), assetsController.bulkImportHandler);

router.get('/', requirePermission('ASSETS', 'view'), assetsController.listAssetsHandler);
router.get('/:id', requirePermission('ASSETS', 'view'), validate(idParamSchema), assetsController.getAssetHandler);
router.post('/', requirePermission('ASSETS', 'add'), validate(createAssetSchema), assetsController.createAssetHandler);
router.put(
  '/:id',
  requirePermission('ASSETS', 'edit'),
  validate(idParamSchema),
  validate(updateAssetSchema),
  assetsController.updateAssetHandler
);
router.delete('/:id', requirePermission('ASSETS', 'delete'), validate(idParamSchema), assetsController.deleteAssetHandler);

export default router;
