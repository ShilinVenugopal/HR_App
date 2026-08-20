import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { bulkImportSchema, createAssetSchema, idParamSchema, updateAssetSchema } from './assets.validation';
import * as assetsController from './assets.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('ASSETS', 'view'), assetsController.listAssetsHandler);

// Bulk import (Excel) — declared before '/:id' so 'bulk' is never matched
// as an asset id. Gated on 'add' since import is an add flow, matching the
// Employees/Recruitment bulk-import convention (the permission matrix has
// no separate "import" action).
router.post('/bulk/import', requirePermission('ASSETS', 'add'), validate(bulkImportSchema), assetsController.bulkImportHandler);

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
