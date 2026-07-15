import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, requireSuperAdmin } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createAttendanceSchema, idParamSchema, updateAttendanceSchema } from './attendance.validation';
import * as attendanceController from './attendance.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('ATTENDANCE', 'view'), attendanceController.listAttendanceHandler);
router.get('/:id', requirePermission('ATTENDANCE', 'view'), validate(idParamSchema), attendanceController.getAttendanceHandler);
router.post('/', requirePermission('ATTENDANCE', 'add'), validate(createAttendanceSchema), attendanceController.markAttendanceHandler);
router.put(
  '/:id',
  requirePermission('ATTENDANCE', 'edit'),
  validate(idParamSchema),
  validate(updateAttendanceSchema),
  attendanceController.updateAttendanceHandler
);
router.delete('/:id', requirePermission('ATTENDANCE', 'delete'), validate(idParamSchema), attendanceController.deleteAttendanceHandler);
router.patch('/:id/approve', requirePermission('ATTENDANCE', 'approve'), validate(idParamSchema), attendanceController.approveAttendanceHandler);
router.patch('/:id/reject', requirePermission('ATTENDANCE', 'approve'), validate(idParamSchema), attendanceController.rejectAttendanceHandler);
router.patch('/:id/lock', requireSuperAdmin, validate(idParamSchema), attendanceController.lockAttendanceHandler);
router.patch('/:id/unlock', requireSuperAdmin, validate(idParamSchema), attendanceController.unlockAttendanceHandler);

export default router;
