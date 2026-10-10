import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as attendanceService from './attendance.service';

export const listAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'date');
  const filters = {
    projectId: req.query.projectId as string | undefined,
    employeeId: req.query.employeeId as string | undefined,
    unitId: req.query.unitId as string | undefined,
    status: req.query.status as string | undefined,
    approvalStatus: req.query.approvalStatus as string | undefined,
    shift: req.query.shift as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
  };
  const { rows, total } = await attendanceService.listAttendance(req, pagination, filters);
  return sendSuccess(res, rows, 'Attendance fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await attendanceService.getAttendance(req, req.params.id);
  return sendSuccess(res, record, 'Attendance record fetched');
});

export const markAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await attendanceService.markAttendance(req, req.body, req.meta);
  return sendSuccess(res, record, 'Attendance marked successfully', 201);
});

export const updateAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await attendanceService.updateAttendance(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, record, 'Attendance updated successfully');
});

export const deleteAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  await attendanceService.deleteAttendance(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Attendance deleted successfully');
});

export const approveAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await attendanceService.setApproval(req, req.params.id, true, req.meta);
  return sendSuccess(res, record, 'Attendance approved');
});

export const rejectAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await attendanceService.setApproval(req, req.params.id, false, req.meta);
  return sendSuccess(res, record, 'Attendance rejected');
});

export const manpowerSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const summary = await attendanceService.getManpowerSummary(req, {
    projectId: req.query.projectId as string,
    month: Number(req.query.month),
    year: Number(req.query.year),
  });
  return sendSuccess(res, summary, 'Manpower summary fetched');
});

export const manpowerSummaryEmployeesHandler = asyncHandler(async (req: Request, res: Response) => {
  const employees = await attendanceService.getManpowerSummaryEmployees(req, {
    projectId: req.query.projectId as string,
    month: Number(req.query.month),
    year: Number(req.query.year),
    unitId: req.query.unitId as string | undefined,
  });
  return sendSuccess(res, employees, 'Manpower summary employee details fetched');
});

export const lockAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await attendanceService.setLock(req, req.params.id, true, req.meta);
  return sendSuccess(res, record, 'Attendance locked');
});

export const unlockAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await attendanceService.setLock(req, req.params.id, false, req.meta);
  return sendSuccess(res, record, 'Attendance unlocked');
});
