import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as inventoryService from './inventory.service';

export const listInventoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const filters = {
    projectId: req.query.projectId as string | undefined,
    costCodeId: req.query.costCodeId as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
  };
  const { rows, total } = await inventoryService.listInventory(req, pagination, filters);
  return sendSuccess(res, rows, 'Inventory fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getInventoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await inventoryService.getInventoryItem(req, req.params.id);
  return sendSuccess(res, record, 'Inventory item fetched');
});

export const createInventoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await inventoryService.createInventoryItem(req, req.body, req.meta);
  return sendSuccess(res, record, 'Inventory item created successfully', 201);
});

export const updateInventoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await inventoryService.updateInventoryItem(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, record, 'Inventory item updated successfully');
});

export const deleteInventoryHandler = asyncHandler(async (req: Request, res: Response) => {
  await inventoryService.deleteInventoryItem(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Inventory item deleted successfully');
});

export const checkDuplicatesHandler = asyncHandler(async (req: Request, res: Response) => {
  const matches = await inventoryService.checkDuplicateInventoryItems(req.body.items);
  return sendSuccess(res, matches, 'Duplicate check complete');
});

export const bulkImportHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await inventoryService.bulkImportInventory(req, req.body.rows, req.body.duplicateStrategy, req.meta);
  return sendSuccess(res, result, 'Bulk import complete');
});
