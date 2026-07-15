import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createComplianceSchema, idParamSchema, updateComplianceSchema } from './compliance.validation';
import * as complianceController from './compliance.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('COMPLIANCE', 'view'), complianceController.listComplianceHandler);
router.get('/expiring-soon', requirePermission('COMPLIANCE', 'view'), complianceController.listExpiringSoonHandler);
router.get('/:id', requirePermission('COMPLIANCE', 'view'), validate(idParamSchema), complianceController.getComplianceHandler);
router.post('/', requirePermission('COMPLIANCE', 'add'), validate(createComplianceSchema), complianceController.createComplianceHandler);
router.put(
  '/:id',
  requirePermission('COMPLIANCE', 'edit'),
  validate(idParamSchema),
  validate(updateComplianceSchema),
  complianceController.updateComplianceHandler
);
router.delete('/:id', requirePermission('COMPLIANCE', 'delete'), validate(idParamSchema), complianceController.deleteComplianceHandler);

export default router;
