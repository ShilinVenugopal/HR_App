import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { bulkImportSchema, checkDuplicatesSchema, createEmployeeSchema, idParamSchema, updateEmployeeSchema } from './employees.validation';
import * as employeesController from './employees.controller';

const router = Router();
router.use(authenticate);

// Bulk import (Excel) — declared before '/:id' so 'bulk' is never matched
// as an employee id.
router.post(
  '/bulk/check-duplicates',
  requirePermission('EMPLOYEES', 'add'),
  validate(checkDuplicatesSchema),
  employeesController.checkDuplicatesHandler
);
router.post(
  '/bulk/import',
  requirePermission('EMPLOYEES', 'add'),
  validate(bulkImportSchema),
  employeesController.bulkImportHandler
);

router.get('/', requirePermission('EMPLOYEES', 'view'), employeesController.listEmployeesHandler);
router.get('/:id', requirePermission('EMPLOYEES', 'view'), validate(idParamSchema), employeesController.getEmployeeHandler);
router.post('/', requirePermission('EMPLOYEES', 'add'), validate(createEmployeeSchema), employeesController.createEmployeeHandler);
router.post(
  '/from-candidate/:candidateId',
  requirePermission('EMPLOYEES', 'add'),
  employeesController.convertCandidateHandler
);
router.put(
  '/:id',
  requirePermission('EMPLOYEES', 'edit'),
  validate(idParamSchema),
  validate(updateEmployeeSchema),
  employeesController.updateEmployeeHandler
);
router.delete('/:id', requirePermission('EMPLOYEES', 'delete'), validate(idParamSchema), employeesController.deleteEmployeeHandler);

export default router;
