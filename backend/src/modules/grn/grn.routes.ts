import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, requireSuperAdmin } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  approversQuerySchema,
  createGrnSchema,
  decideGrnSchema,
  idParamSchema,
  rejectOrReturnGrnSchema,
  submitGrnSchema,
  updateGrnSchema,
} from './grn.validation';
import * as grnController from './grn.controller';

const router = Router();
router.use(authenticate);

// Declared before '/:id' so 'approvers' is never matched as a GRN id.
router.get('/approvers', requirePermission('GRN', 'view'), validate(approversQuerySchema), grnController.listApproversHandler);

router.get('/', requirePermission('GRN', 'view'), grnController.listGrnHandler);
router.get('/:id', requirePermission('GRN', 'view'), validate(idParamSchema), grnController.getGrnHandler);
router.post('/', requirePermission('GRN', 'add'), validate(createGrnSchema), grnController.createGrnHandler);
router.put('/:id', requirePermission('GRN', 'edit'), validate(idParamSchema), validate(updateGrnSchema), grnController.updateGrnHandler);
router.delete('/:id', requirePermission('GRN', 'delete'), validate(idParamSchema), grnController.deleteGrnHandler);

router.post('/:id/submit', requirePermission('GRN', 'edit'), validate(idParamSchema), validate(submitGrnSchema), grnController.submitGrnHandler);
router.post('/:id/approve', requirePermission('GRN', 'approve'), validate(idParamSchema), validate(decideGrnSchema), grnController.approveGrnHandler);
router.post(
  '/:id/reject',
  requirePermission('GRN', 'approve'),
  validate(idParamSchema),
  validate(rejectOrReturnGrnSchema),
  grnController.rejectGrnHandler
);
router.post(
  '/:id/return',
  requirePermission('GRN', 'approve'),
  validate(idParamSchema),
  validate(rejectOrReturnGrnSchema),
  grnController.returnGrnHandler
);
router.patch('/:id/unlock', requireSuperAdmin, validate(idParamSchema), grnController.unlockGrnHandler);
router.post('/:id/update-inventory', requirePermission('GRN', 'edit'), validate(idParamSchema), grnController.updateInventoryHandler);

export default router;
