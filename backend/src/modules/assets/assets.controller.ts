import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as assetsService from './assets.service';

export const listAssetsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const filters = {
    projectId: req.query.projectId as string | undefined,
    costCodeId: req.query.costCodeId as string | undefined,
    date: req.query.date as string | undefined,
  };
  const { rows, total } = await assetsService.listAssets(req, pagination, filters);
  return sendSuccess(res, rows, 'Assets fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getAssetHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await assetsService.getAsset(req, req.params.id);
  return sendSuccess(res, record, 'Asset fetched');
});

export const createAssetHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await assetsService.createAsset(req, req.body, req.meta);
  return sendSuccess(res, record, 'Asset created successfully', 201);
});

export const updateAssetHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await assetsService.updateAsset(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, record, 'Asset updated successfully');
});

export const deleteAssetHandler = asyncHandler(async (req: Request, res: Response) => {
  await assetsService.deleteAsset(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Asset deleted successfully');
});

export const bulkImportHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await assetsService.bulkImportAssets(req, req.body.rows, req.meta);
  return sendSuccess(res, result, 'Bulk import complete');
});
