import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as grnService from './grn.service';

export const listGrnHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const filters = {
    projectId: req.query.projectId as string | undefined,
    poId: req.query.poId as string | undefined,
    status: req.query.status as string | undefined,
  };
  const { rows, total } = await grnService.listGoodsReceivedNotes(req, pagination, filters);
  return sendSuccess(res, rows, 'Goods Received Notes fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getGrnHandler = asyncHandler(async (req: Request, res: Response) => {
  const grn = await grnService.getGoodsReceivedNote(req, req.params.id);
  return sendSuccess(res, grn, 'Goods Received Note fetched');
});

export const createGrnHandler = asyncHandler(async (req: Request, res: Response) => {
  const grn = await grnService.createGoodsReceivedNote(req, req.body, req.meta);
  return sendSuccess(res, grn, 'Goods Received Note created successfully', 201);
});

export const updateGrnHandler = asyncHandler(async (req: Request, res: Response) => {
  const grn = await grnService.updateGoodsReceivedNote(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, grn, 'Goods Received Note updated successfully');
});

export const deleteGrnHandler = asyncHandler(async (req: Request, res: Response) => {
  await grnService.deleteGoodsReceivedNote(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Goods Received Note deleted successfully');
});

export const listApproversHandler = asyncHandler(async (req: Request, res: Response) => {
  const approvers = await grnService.listApprovers(req, req.query.projectId as string);
  return sendSuccess(res, approvers, 'Eligible approvers fetched');
});

export const submitGrnHandler = asyncHandler(async (req: Request, res: Response) => {
  const grn = await grnService.submitGoodsReceivedNote(req, req.params.id, req.body.approverId, req.meta);
  return sendSuccess(res, grn, 'Submitted for approval');
});

export const approveGrnHandler = asyncHandler(async (req: Request, res: Response) => {
  const grn = await grnService.decideGoodsReceivedNote(req, req.params.id, 'APPROVE', req.body.comments, req.meta);
  return sendSuccess(res, grn, 'Goods Received Note approved');
});

export const rejectGrnHandler = asyncHandler(async (req: Request, res: Response) => {
  const grn = await grnService.decideGoodsReceivedNote(req, req.params.id, 'REJECT', req.body.comments, req.meta);
  return sendSuccess(res, grn, 'Goods Received Note rejected');
});

export const returnGrnHandler = asyncHandler(async (req: Request, res: Response) => {
  const grn = await grnService.decideGoodsReceivedNote(req, req.params.id, 'RETURN', req.body.comments, req.meta);
  return sendSuccess(res, grn, 'Goods Received Note returned to submitter');
});

export const unlockGrnHandler = asyncHandler(async (req: Request, res: Response) => {
  const grn = await grnService.unlockGoodsReceivedNote(req, req.params.id, req.meta);
  return sendSuccess(res, grn, 'Goods Received Note unlocked');
});

export const updateInventoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const grn = await grnService.updateInventoryFromGrn(req, req.params.id, req.meta);
  return sendSuccess(res, grn, 'Inventory updated from Goods Received Note');
});
