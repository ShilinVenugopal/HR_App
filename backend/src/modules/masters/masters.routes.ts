import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createMasterSchema, idParamSchema, updateMasterSchema } from './masters.validation';
import * as mastersController from './masters.controller';

/// Shared router factory for Departments, Designations and Cost Codes —
/// all reference/master data gated by the SETTINGS module permission.
function buildMasterRouter() {
  const router = Router();
  router.use(authenticate);

  // Reference data: any authenticated user may read it — Recruitment and
  // Employees forms need these dropdowns regardless of whether the user
  // also holds SETTINGS permission. Read access to master lists is not a
  // confidentiality concern the way project-scoped operational data is.
  // Writes (below) are still gated by the SETTINGS permission matrix.
  router.get('/', mastersController.listMastersHandler);
  router.post('/', requirePermission('SETTINGS', 'add'), validate(createMasterSchema), mastersController.createMasterHandler);
  router.put(
    '/:id',
    requirePermission('SETTINGS', 'edit'),
    validate(idParamSchema),
    validate(updateMasterSchema),
    mastersController.updateMasterHandler
  );
  router.delete('/:id', requirePermission('SETTINGS', 'delete'), validate(idParamSchema), mastersController.deleteMasterHandler);

  return router;
}

export const departmentsRouter = buildMasterRouter();
export const designationsRouter = buildMasterRouter();
export const costCodesRouter = buildMasterRouter();
