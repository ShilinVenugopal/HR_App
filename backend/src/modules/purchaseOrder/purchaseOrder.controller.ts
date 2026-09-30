import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as poService from './purchaseOrder.service';

export const listPoHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const filters = {
    projectId: req.query.projectId as string | undefined,
    vendorId: req.query.vendorId as string | undefined,
    status: req.query.status as string | undefined,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
  };
  const { rows, total } = await poService.listPurchaseOrders(req, pagination, filters);
  return sendSuccess(res, rows, 'Purchase Orders fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getPoHandler = asyncHandler(async (req: Request, res: Response) => {
  const po = await poService.getPurchaseOrder(req, req.params.id);
  return sendSuccess(res, po, 'Purchase Order fetched');
});

export const createPoHandler = asyncHandler(async (req: Request, res: Response) => {
  const po = await poService.createPurchaseOrder(req, req.body, req.meta);
  return sendSuccess(res, po, 'Purchase Order created successfully', 201);
});

export const updatePoHandler = asyncHandler(async (req: Request, res: Response) => {
  const po = await poService.updatePurchaseOrder(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, po, 'Purchase Order updated successfully');
});

export const deletePoHandler = asyncHandler(async (req: Request, res: Response) => {
  await poService.deletePurchaseOrder(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Purchase Order deleted successfully');
});

export const listApproversHandler = asyncHandler(async (req: Request, res: Response) => {
  const approvers = await poService.listApprovers(req, req.query.projectId as string);
  return sendSuccess(res, approvers, 'Eligible approvers fetched');
});

export const submitPoHandler = asyncHandler(async (req: Request, res: Response) => {
  const po = await poService.submitPurchaseOrder(req, req.params.id, req.body.approverId, req.meta);
  return sendSuccess(res, po, 'Submitted for approval');
});

export const approvePoHandler = asyncHandler(async (req: Request, res: Response) => {
  const po = await poService.decidePurchaseOrder(req, req.params.id, 'APPROVE', req.body.comments, req.meta);
  return sendSuccess(res, po, 'Purchase Order approved');
});

export const rejectPoHandler = asyncHandler(async (req: Request, res: Response) => {
  const po = await poService.decidePurchaseOrder(req, req.params.id, 'REJECT', req.body.comments, req.meta);
  return sendSuccess(res, po, 'Purchase Order rejected');
});

export const unlockPoHandler = asyncHandler(async (req: Request, res: Response) => {
  const po = await poService.unlockPurchaseOrder(req, req.params.id, req.meta);
  return sendSuccess(res, po, 'Purchase Order unlocked');
});

export const updatePoSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const po = await poService.updatePurchaseOrderSettings(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, po, 'Purchase Order settings updated');
});
