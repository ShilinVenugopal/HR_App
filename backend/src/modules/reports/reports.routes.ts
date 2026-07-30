import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import * as reportsController from './reports.controller';

const router = Router();
router.use(authenticate, requirePermission('REPORTS', 'view'));

router.get('/manpower', reportsController.manpowerReportHandler);
router.get('/employees', reportsController.employeeReportHandler);
router.get('/attendance', reportsController.attendanceReportHandler);
router.get('/recruitment', reportsController.recruitmentReportHandler);
router.get('/payroll', reportsController.payrollReportHandler);
router.get('/procurement-summary', reportsController.procurementSummaryReportHandler);
router.get('/vendor-spend', reportsController.vendorSpendReportHandler);

export default router;
