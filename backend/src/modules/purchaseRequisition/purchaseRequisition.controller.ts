import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as prService from './purchaseRequisition.service';

export const listPrHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const filters = {
    projectId: req.query.projectId as string | undefined,
    status: req.query.status as string | undefined,
  };
  const { rows, total } = await prService.listPurchaseRequisitions(req, pagination, filters);
  return sendSuccess(res, rows, 'Purchase Requisitions fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getPrHandler = asyncHandler(async (req: Request, res: Response) => {
  const pr = await prService.getPurchaseRequisition(req, req.params.id);
  return sendSuccess(res, pr, 'Purchase Requisition fetched');
});

export const createPrHandler = asyncHandler(async (req: Request, res: Response) => {
  const pr = await prService.createPurchaseRequisition(req, req.body, req.meta);
  return sendSuccess(res, pr, 'Purchase Requisition created successfully', 201);
});

export const updatePrHandler = asyncHandler(async (req: Request, res: Response) => {
  const pr = await prService.updatePurchaseRequisition(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, pr, 'Purchase Requisition updated successfully');
});

export const deletePrHandler = asyncHandler(async (req: Request, res: Response) => {
  await prService.deletePurchaseRequisition(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Purchase Requisition deleted successfully');
});

export const listApproversHandler = asyncHandler(async (req: Request, res: Response) => {
  const approvers = await prService.listApprovers(req, req.query.projectId as string);
  return sendSuccess(res, approvers, 'Eligible approvers fetched');
});

export const submitPrHandler = asyncHandler(async (req: Request, res: Response) => {
  const pr = await prService.submitPurchaseRequisition(req, req.params.id, req.body.approverId, req.meta);
  return sendSuccess(res, pr, 'Submitted for approval');
});

export const approvePrHandler = asyncHandler(async (req: Request, res: Response) => {
  const pr = await prService.decidePurchaseRequisition(req, req.params.id, 'APPROVE', req.body.comments, req.meta);
  return sendSuccess(res, pr, 'Purchase Requisition approved');
});

export const rejectPrHandler = asyncHandler(async (req: Request, res: Response) => {
  const pr = await prService.decidePurchaseRequisition(req, req.params.id, 'REJECT', req.body.comments, req.meta);
  return sendSuccess(res, pr, 'Purchase Requisition rejected');
});

export const returnPrHandler = asyncHandler(async (req: Request, res: Response) => {
  const pr = await prService.decidePurchaseRequisition(req, req.params.id, 'RETURN', req.body.comments, req.meta);
  return sendSuccess(res, pr, 'Purchase Requisition returned to requester');
});

export const unlockPrHandler = asyncHandler(async (req: Request, res: Response) => {
  const pr = await prService.unlockPurchaseRequisition(req, req.params.id, req.meta);
  return sendSuccess(res, pr, 'Purchase Requisition unlocked');
});
