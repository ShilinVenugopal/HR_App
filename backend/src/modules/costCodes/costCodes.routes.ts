import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireSuperAdmin } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createCostCodeSchema, idParamSchema, updateCostCodeSchema } from './costCodes.validation';
import * as costCodesController from './costCodes.controller';

const router = Router();
router.use(authenticate);

// Read access is open to any authenticated user — Inventory/PR/PO/GRN
// dropdowns need this list regardless of the caller's SETTINGS permission,
// same "reference data is not a confidentiality concern" reasoning the
// Department/Designation masters already follow. Only mutations are
// Super-Admin-only, per the design brief: "Only the Super Admin can add,
// edit, delete/deactivate cost codes."
router.get('/', costCodesController.listCostCodesHandler);
router.post('/', requireSuperAdmin, validate(createCostCodeSchema), costCodesController.createCostCodeHandler);
router.put('/:id', requireSuperAdmin, validate(idParamSchema), validate(updateCostCodeSchema), costCodesController.updateCostCodeHandler);
router.delete('/:id', requireSuperAdmin, validate(idParamSchema), costCodesController.deleteCostCodeHandler);

export default router;
