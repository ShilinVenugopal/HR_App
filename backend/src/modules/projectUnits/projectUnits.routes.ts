import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireSuperAdmin } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createProjectUnitSchema, idParamSchema, listQuerySchema, updateProjectUnitSchema } from './projectUnits.validation';
import * as projectUnitsController from './projectUnits.controller';

const router = Router();
router.use(authenticate);

// Reference data: readable by any authenticated user with access to the
// project in question (Mark Attendance needs the dropdown regardless of
// whether the user also manages Units). Mutations are Super-Admin-only,
// same split as Cost Code Master — Units are shared master data a
// per-user permission grant shouldn't gate.
router.get('/', validate(listQuerySchema), projectUnitsController.listProjectUnitsHandler);
router.get('/:id', validate(idParamSchema), projectUnitsController.getProjectUnitHandler);
router.post('/', requireSuperAdmin, validate(createProjectUnitSchema), projectUnitsController.createProjectUnitHandler);
router.put(
  '/:id',
  requireSuperAdmin,
  validate(idParamSchema),
  validate(updateProjectUnitSchema),
  projectUnitsController.updateProjectUnitHandler
);
router.delete('/:id', requireSuperAdmin, validate(idParamSchema), projectUnitsController.deleteProjectUnitHandler);

export default router;
