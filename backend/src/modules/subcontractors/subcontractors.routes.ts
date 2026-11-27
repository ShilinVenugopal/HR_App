import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createSubcontractorSchema, idParamSchema, updateSubcontractorSchema } from './subcontractors.validation';
import * as subcontractorsController from './subcontractors.controller';

const router = Router();
router.use(authenticate);

// Declared before '/:id' so this fixed segment is never matched as a
// subcontractor id. Gated the same as every other read here — unlike
// Vendor, Subcontractors is its own standalone, permission-gated module
// (not cross-module reference data another module's form also needs), so
// the Subcontractor Payments bill-entry dropdown is only reachable by
// someone who already holds SUBCONTRACTORS view.
router.get('/options', requirePermission('SUBCONTRACTORS', 'view'), subcontractorsController.listSubcontractorOptionsHandler);

router.get('/', requirePermission('SUBCONTRACTORS', 'view'), subcontractorsController.listSubcontractorsHandler);
router.get('/:id', requirePermission('SUBCONTRACTORS', 'view'), validate(idParamSchema), subcontractorsController.getSubcontractorHandler);
router.post(
  '/',
  requirePermission('SUBCONTRACTORS', 'add'),
  validate(createSubcontractorSchema),
  subcontractorsController.createSubcontractorHandler
);
router.put(
  '/:id',
  requirePermission('SUBCONTRACTORS', 'edit'),
  validate(idParamSchema),
  validate(updateSubcontractorSchema),
  subcontractorsController.updateSubcontractorHandler
);
router.delete(
  '/:id',
  requirePermission('SUBCONTRACTORS', 'delete'),
  validate(idParamSchema),
  subcontractorsController.deleteSubcontractorHandler
);

export default router;
