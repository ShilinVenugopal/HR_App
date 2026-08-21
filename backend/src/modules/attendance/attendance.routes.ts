import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, requireSuperAdmin } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createAttendanceSchema,
  idParamSchema,
  manpowerSummaryEmployeesQuerySchema,
  manpowerSummaryQuerySchema,
  updateAttendanceSchema,
} from './attendance.validation';
import * as attendanceController from './attendance.controller';

const router = Router();
router.use(authenticate);

// Registered ahead of the /:id routes below — otherwise Express would
// match "manpower-summary" as an :id param instead of this literal path.
router.get(
  '/manpower-summary',
  requirePermission('ATTENDANCE', 'view'),
  validate(manpowerSummaryQuerySchema),
  attendanceController.manpowerSummaryHandler
);
router.get(
  '/manpower-summary/employees',
  requirePermission('ATTENDANCE', 'view'),
  validate(manpowerSummaryEmployeesQuerySchema),
  attendanceController.manpowerSummaryEmployeesHandler
);

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
