import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, requireSuperAdmin } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  addCommentSchema,
  attachFileSchema,
  changePrioritySchema,
  changeStatusSchema,
  createTicketSchema,
  idParamSchema,
  manageAssigneesSchema,
} from './tickets.validation';
import * as ticketsController from './tickets.controller';

const router = Router();
router.use(authenticate);

// Declared before '/:id' so these are never matched as a ticket id.
router.get('/dashboard', requirePermission('TICKETS', 'view'), ticketsController.dashboardHandler);
router.get('/assignable-users', requirePermission('TICKETS', 'view'), ticketsController.assignableUsersHandler);

router.get('/', requirePermission('TICKETS', 'view'), ticketsController.listTicketsHandler);
router.get('/:id', requirePermission('TICKETS', 'view'), validate(idParamSchema), ticketsController.getTicketHandler);
router.post('/', requirePermission('TICKETS', 'add'), validate(createTicketSchema), ticketsController.createTicketHandler);

router.post('/:id/comments', requirePermission('TICKETS', 'view'), validate(addCommentSchema), ticketsController.addCommentHandler);
router.patch('/:id/status', requirePermission('TICKETS', 'view'), validate(changeStatusSchema), ticketsController.changeStatusHandler);
router.patch('/:id/priority', requirePermission('TICKETS', 'view'), validate(changePrioritySchema), ticketsController.changePriorityHandler);
router.patch(
  '/:id/assignees',
  requirePermission('TICKETS', 'view'),
  validate(manageAssigneesSchema),
  ticketsController.manageAssigneesHandler
);
router.post('/:id/attachments', requirePermission('TICKETS', 'view'), validate(attachFileSchema), ticketsController.attachFileHandler);

router.delete('/:id', requireSuperAdmin, validate(idParamSchema), ticketsController.deleteTicketHandler);

export default router;
