import { Request, Response } from 'express';
import { ProjectStatus } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as costCodesService from './costCodes.service';

export const listCostCodesHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'code');
  const filters = { status: req.query.status as ProjectStatus | undefined };
  const { rows, total } = await costCodesService.listCostCodes(pagination, filters);
  return sendSuccess(res, rows, 'Cost codes fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const createCostCodeHandler = asyncHandler(async (req: Request, res: Response) => {
  const row = await costCodesService.createCostCode(req.body, req.user!.sub, req.meta);
  return sendSuccess(res, row, 'Cost Code created successfully', 201);
});

export const updateCostCodeHandler = asyncHandler(async (req: Request, res: Response) => {
  const row = await costCodesService.updateCostCode(req.params.id, req.body, req.user!.sub, req.meta);
  return sendSuccess(res, row, 'Cost Code updated successfully');
});

export const deleteCostCodeHandler = asyncHandler(async (req: Request, res: Response) => {
  await costCodesService.deleteCostCode(req.params.id, req.user!.sub, req.meta);
  return sendSuccess(res, null, 'Cost Code deleted successfully');
});
