import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as mastersService from './masters.service';

function entityFrom(req: Request): 'department' | 'designation' | 'costCode' {
  if (req.baseUrl.includes('designations')) return 'designation';
  if (req.baseUrl.includes('cost-codes')) return 'costCode';
  return 'department';
}

export const listMastersHandler = asyncHandler(async (req: Request, res: Response) => {
  const entity = entityFrom(req);
  const pagination = parsePagination(req, 'name');
  const { rows, total } = await mastersService.listMasters(entity, pagination);
  return sendSuccess(res, rows, `${entity}s fetched`, 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const createMasterHandler = asyncHandler(async (req: Request, res: Response) => {
  const entity = entityFrom(req);
  const row = await mastersService.createMaster(entity, req.body, req.user!.sub, req.meta);
  return sendSuccess(res, row, `${entity} created successfully`, 201);
});

export const updateMasterHandler = asyncHandler(async (req: Request, res: Response) => {
  const entity = entityFrom(req);
  const row = await mastersService.updateMaster(entity, req.params.id, req.body, req.user!.sub, req.meta);
  return sendSuccess(res, row, `${entity} updated successfully`);
});

export const deleteMasterHandler = asyncHandler(async (req: Request, res: Response) => {
  const entity = entityFrom(req);
  await mastersService.deleteMaster(entity, req.params.id, req.user!.sub, req.meta);
  return sendSuccess(res, null, `${entity} deleted successfully`);
});
