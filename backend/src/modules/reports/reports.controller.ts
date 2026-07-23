import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import * as reportsService from './reports.service';

export const manpowerReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.projectWiseManpowerReport(req);
  return sendSuccess(res, data, 'Project-wise manpower report fetched');
});

export const employeeReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.employeeReport(req);
  return sendSuccess(res, data, 'Employee report fetched');
});

export const attendanceReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.attendanceReport(req, req.query.dateFrom as string, req.query.dateTo as string);
  return sendSuccess(res, data, 'Attendance report fetched');
});

export const recruitmentReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await reportsService.recruitmentReport(req);
  return sendSuccess(res, data, 'Recruitment report fetched');
});

export const payrollReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const month = req.query.month ? Number(req.query.month) : undefined;
  const year = req.query.year ? Number(req.query.year) : undefined;
  const data = await reportsService.payrollReport(req, month, year);
  return sendSuccess(res, data, 'Payroll report fetched');
});
