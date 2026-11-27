import { Request, Response } from 'express';
import { ContractingType, SubcontractorStatus } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as subcontractorsService from './subcontractors.service';

export const listSubcontractorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'companyName');
  const filters = {
    contractingType: req.query.contractingType as ContractingType | undefined,
    status: req.query.status as SubcontractorStatus | undefined,
  };
  const { rows, total } = await subcontractorsService.listSubcontractors(pagination, filters);
  return sendSuccess(res, rows, 'Subcontractors fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const listSubcontractorOptionsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const options = await subcontractorsService.listSubcontractorOptions();
  return sendSuccess(res, options, 'Subcontractor options fetched');
});

export const getSubcontractorHandler = asyncHandler(async (req: Request, res: Response) => {
  const subcontractor = await subcontractorsService.getSubcontractor(req.params.id);
  return sendSuccess(res, subcontractor, 'Subcontractor fetched');
});

export const createSubcontractorHandler = asyncHandler(async (req: Request, res: Response) => {
  const subcontractor = await subcontractorsService.createSubcontractor(req.body, req.user!.sub, req.meta);
  return sendSuccess(res, subcontractor, 'Subcontractor created successfully', 201);
});

export const updateSubcontractorHandler = asyncHandler(async (req: Request, res: Response) => {
  const subcontractor = await subcontractorsService.updateSubcontractor(req.params.id, req.body, req.user!.sub, req.meta);
  return sendSuccess(res, subcontractor, 'Subcontractor updated successfully');
});

export const deleteSubcontractorHandler = asyncHandler(async (req: Request, res: Response) => {
  await subcontractorsService.deleteSubcontractor(req.params.id, req.user!.sub, req.meta);
  return sendSuccess(res, null, 'Subcontractor deleted successfully');
});
