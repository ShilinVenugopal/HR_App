import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { env } from './config/env';
import { apiRateLimiter } from './middleware/rateLimit.middleware';
import { auditUnauthorizedResponses } from './middleware/audit.middleware';
import { notFoundHandler, globalErrorHandler } from './middleware/error.middleware';
import { UPLOAD_ROOT } from './utils/upload';

import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import projectsRoutes from './modules/projects/projects.routes';
import { costCodesRouter, departmentsRouter, designationsRouter } from './modules/masters/masters.routes';
import employeesRoutes from './modules/employees/employees.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import purchaseRequisitionRoutes from './modules/purchaseRequisition/purchaseRequisition.routes';
import vendorsRoutes from './modules/vendors/vendors.routes';
import purchaseOrderRoutes from './modules/purchaseOrder/purchaseOrder.routes';
import grnRoutes from './modules/grn/grn.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import recruitmentRoutes from './modules/recruitment/recruitment.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import wagesRoutes from './modules/wages/wages.routes';
import projectWagesRoutes from './modules/projectWages/projectWages.routes';
import complianceRoutes from './modules/compliance/compliance.routes';
import advancesRoutes from './modules/advances/advances.routes';
import reportsRoutes from './modules/reports/reports.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import procurementDashboardRoutes from './modules/procurementDashboard/procurementDashboard.routes';
import auditLogRoutes from './modules/auditLogs/auditLog.routes';
import uploadRoutes from './modules/uploads/upload.routes';
import communicationRoutes from './modules/communication/communication.routes';
import communicationPublicRoutes from './modules/communication/communicationPublic.routes';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(compression());
// 10mb covers bulk-import payloads (up to 2000 candidate rows as JSON).
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.isProduction ? 'combined' : 'dev'));
app.use(auditUnauthorizedResponses);
app.use(apiRateLimiter);

app.use('/uploads', express.static(UPLOAD_ROOT));

app.get('/health', (_req, res) => res.json({ success: true, message: 'HR App API is healthy' }));

const api = express.Router();
api.use('/auth', authRoutes);
api.use('/users', usersRoutes);
api.use('/projects', projectsRoutes);
api.use('/departments', departmentsRouter);
api.use('/designations', designationsRouter);
api.use('/cost-codes', costCodesRouter);
api.use('/employees', employeesRoutes);
api.use('/inventory', inventoryRoutes);
api.use('/purchase-requisitions', purchaseRequisitionRoutes);
api.use('/vendors', vendorsRoutes);
api.use('/purchase-orders', purchaseOrderRoutes);
api.use('/grns', grnRoutes);
api.use('/notifications', notificationsRoutes);
api.use('/recruitment', recruitmentRoutes);
api.use('/attendance', attendanceRoutes);
api.use('/wages', wagesRoutes);
api.use('/project-wages', projectWagesRoutes);
api.use('/compliance', complianceRoutes);
api.use('/advances', advancesRoutes);
api.use('/reports', reportsRoutes);
api.use('/dashboard', dashboardRoutes);
api.use('/procurement-dashboard', procurementDashboardRoutes);
api.use('/audit-logs', auditLogRoutes);
api.use('/uploads', uploadRoutes);
api.use('/communication', communicationRoutes);
api.use('/', communicationPublicRoutes);

app.use(env.apiPrefix, api);

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
