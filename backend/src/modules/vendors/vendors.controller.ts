import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as vendorsService from './vendors.service';

export const listVendorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'name');
  const { rows, total } = await vendorsService.listVendors(pagination);
  return sendSuccess(res, rows, 'Vendors fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getVendorHandler = asyncHandler(async (req: Request, res: Response) => {
  const vendor = await vendorsService.getVendor(req.params.id);
  return sendSuccess(res, vendor, 'Vendor fetched');
});

export const createVendorHandler = asyncHandler(async (req: Request, res: Response) => {
  const vendor = await vendorsService.createVendor(req.body, req.user!.sub, req.meta);
  return sendSuccess(res, vendor, 'Vendor created successfully', 201);
});

export const updateVendorHandler = asyncHandler(async (req: Request, res: Response) => {
  const vendor = await vendorsService.updateVendor(req.params.id, req.body, req.user!.sub, req.meta);
  return sendSuccess(res, vendor, 'Vendor updated successfully');
});

export const deleteVendorHandler = asyncHandler(async (req: Request, res: Response) => {
  await vendorsService.deleteVendor(req.params.id, req.user!.sub, req.meta);
  return sendSuccess(res, null, 'Vendor deleted successfully');
});
