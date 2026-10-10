import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as notificationsController from './notifications.controller';

const router = Router();
router.use(authenticate);

router.get('/', notificationsController.listNotificationsHandler);
router.patch('/read-all', notificationsController.markAllNotificationsReadHandler);
router.patch('/:id/read', notificationsController.markNotificationReadHandler);

export default router;
