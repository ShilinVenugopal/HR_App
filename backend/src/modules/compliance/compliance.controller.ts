import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as complianceService from './compliance.service';

export const listComplianceHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'validTo');
  const filters = {
    projectId: req.query.projectId as string | undefined,
    employeeId: req.query.employeeId as string | undefined,
    type: req.query.type as string | undefined,
    status: req.query.status as string | undefined,
  };
  const { rows, total } = await complianceService.listCompliance(req, pagination, filters);
  return sendSuccess(res, rows, 'Compliance records fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const listExpiringSoonHandler = asyncHandler(async (req: Request, res: Response) => {
  const days = req.query.days ? Number(req.query.days) : 30;
  const rows = await complianceService.listExpiringSoon(req, days);
  return sendSuccess(res, rows, 'Expiring compliance items fetched');
});

export const getComplianceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await complianceService.getCompliance(req, req.params.id);
  return sendSuccess(res, record, 'Compliance record fetched');
});

export const createComplianceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await complianceService.createCompliance(req, req.body, req.meta);
  return sendSuccess(res, record, 'Compliance record created successfully', 201);
});

export const updateComplianceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await complianceService.updateCompliance(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, record, 'Compliance record updated successfully');
});

export const deleteComplianceHandler = asyncHandler(async (req: Request, res: Response) => {
  await complianceService.deleteCompliance(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Compliance record deleted successfully');
});
