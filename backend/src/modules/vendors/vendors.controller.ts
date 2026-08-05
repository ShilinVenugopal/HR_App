import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as vendorsService from './vendors.service';

/// Bank details are sensitive — only Super Admin or someone who actually
/// holds PURCHASE_ORDER edit rights (i.e. can manage vendors, not just
/// select one for a PO) gets them back from the API at all. Everyone else
/// gets every other field; this is enforced here, not just hidden in the
/// UI, per the "don't expose vendor banking details through unauthorised
/// APIs" requirement.
function canSeeBankDetails(req: Request): boolean {
  const user = req.user!;
  if (user.role === Role.SUPER_ADMIN) return true;
  return Boolean(user.permissions['PURCHASE_ORDER']?.canEdit);
}

function redactBankDetails<T extends { bankAccountNumber?: string | null; bankIfscCode?: string | null }>(vendor: T): T {
  return { ...vendor, bankAccountNumber: null, bankIfscCode: null };
}

export const listVendorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'name');
  const { rows, total } = await vendorsService.listVendors(pagination);
  const canSeeBank = canSeeBankDetails(req);
  const data = canSeeBank ? rows : rows.map(redactBankDetails);
  return sendSuccess(res, data, 'Vendors fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getVendorHandler = asyncHandler(async (req: Request, res: Response) => {
  const vendor = await vendorsService.getVendor(req.params.id);
  const data = canSeeBankDetails(req) ? vendor : redactBankDetails(vendor);
  return sendSuccess(res, data, 'Vendor fetched');
});

export const checkDuplicateVendorHandler = asyncHandler(async (req: Request, res: Response) => {
  const name = String(req.query.name ?? '').trim();
  const phone = String(req.query.phone ?? '').trim();
  if (!name && !phone) return sendSuccess(res, null, 'No duplicate check performed');
  const match = await vendorsService.findPossibleDuplicateVendor(name, phone);
  return sendSuccess(res, match, match ? 'Possible duplicate found' : 'No duplicate found');
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
