import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as wagesService from './wages.service';

export const listWagesHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'year');
  const filters = {
    projectId: req.query.projectId as string | undefined,
    employeeId: req.query.employeeId as string | undefined,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    status: req.query.status as string | undefined,
  };
  const { rows, total } = await wagesService.listWages(req, pagination, filters);
  return sendSuccess(res, rows, 'Wage records fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getWageHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await wagesService.getWage(req, req.params.id);
  return sendSuccess(res, record, 'Wage record fetched');
});

export const createWageHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await wagesService.createWage(req, req.body, req.meta);
  return sendSuccess(res, record, 'Wage record generated successfully', 201);
});

export const updateWageHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await wagesService.updateWage(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, record, 'Wage record updated successfully');
});

export const deleteWageHandler = asyncHandler(async (req: Request, res: Response) => {
  await wagesService.deleteWage(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Wage record deleted successfully');
});

export const approveWageHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await wagesService.approveWage(req, req.params.id, req.meta);
  return sendSuccess(res, record, 'Wage record approved');
});

export const markWagePaidHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await wagesService.markWagePaid(req, req.params.id, req.meta);
  return sendSuccess(res, record, 'Wage record marked as paid');
});
