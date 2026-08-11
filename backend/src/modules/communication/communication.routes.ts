import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  candidateIdParamSchema,
  createTemplateSchema,
  idParamSchema,
  sendBulkSchema,
  sendTestSchema,
  updateTemplateSchema,
} from './communication.validation';
import * as communicationController from './communication.controller';

const router = Router();
router.use(authenticate);

// Templates — read is view-level, write (create/edit/duplicate/delete) is
// gated on RECRUITMENT canApprove, the same flag that gates sending. This
// reuses the existing configurable permission matrix rather than
// hardcoding a role list — an admin can grant "can send communications"
// to any role via User Management, same as any other module permission.
router.get('/templates', requirePermission('RECRUITMENT', 'view'), communicationController.listTemplatesHandler);
router.post(
  '/templates',
  requirePermission('RECRUITMENT', 'approve'),
  validate(createTemplateSchema),
  communicationController.createTemplateHandler
);
router.put(
  '/templates/:id',
  requirePermission('RECRUITMENT', 'approve'),
  validate(idParamSchema),
  validate(updateTemplateSchema),
  communicationController.updateTemplateHandler
);
router.post(
  '/templates/:id/duplicate',
  requirePermission('RECRUITMENT', 'approve'),
  validate(idParamSchema),
  communicationController.duplicateTemplateHandler
);
router.delete(
  '/templates/:id',
  requirePermission('RECRUITMENT', 'approve'),
  validate(idParamSchema),
  communicationController.deleteTemplateHandler
);

// Sending
router.post('/send', requirePermission('RECRUITMENT', 'approve'), validate(sendBulkSchema), communicationController.sendBulkHandler);
router.post(
  '/send-test',
  requirePermission('RECRUITMENT', 'approve'),
  validate(sendTestSchema),
  communicationController.sendTestHandler
);

// History / timeline / stats — read-only, available to anyone with
// RECRUITMENT view (matches "other users should have read-only access").
router.get('/history', requirePermission('RECRUITMENT', 'view'), communicationController.listHistoryHandler);
router.get(
  '/candidates/:candidateId/timeline',
  requirePermission('RECRUITMENT', 'view'),
  validate(candidateIdParamSchema),
  communicationController.getCandidateTimelineHandler
);
router.patch(
  '/history/:id/resend',
  requirePermission('RECRUITMENT', 'approve'),
  validate(idParamSchema),
  communicationController.resendHandler
);
router.delete(
  '/history/:id',
  requirePermission('RECRUITMENT', 'approve'),
  validate(idParamSchema),
  communicationController.deleteHistoryHandler
);
router.get('/stats', requirePermission('RECRUITMENT', 'view'), communicationController.getStatsHandler);
router.get('/config', requirePermission('RECRUITMENT', 'view'), communicationController.getConfigHandler);

export default router;
