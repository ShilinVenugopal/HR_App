import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as advancesService from './advances.service';

export const listAdvancesHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const filters = {
    projectId: req.query.projectId as string | undefined,
    employeeId: req.query.employeeId as string | undefined,
    type: req.query.type as string | undefined,
    status: req.query.status as string | undefined,
  };
  const { rows, total } = await advancesService.listAdvances(req, pagination, filters);
  return sendSuccess(res, rows, 'Advances fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getAdvanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await advancesService.getAdvance(req, req.params.id);
  return sendSuccess(res, record, 'Advance fetched');
});

export const createAdvanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await advancesService.createAdvance(req, req.body, req.meta);
  return sendSuccess(res, record, 'Advance/Loan request created successfully', 201);
});

export const updateAdvanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await advancesService.updateAdvance(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, record, 'Advance/Loan updated successfully');
});

export const approveAdvanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await advancesService.setAdvanceApproval(req, req.params.id, true, req.meta);
  return sendSuccess(res, record, 'Advance/Loan approved');
});

export const rejectAdvanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await advancesService.setAdvanceApproval(req, req.params.id, false, req.meta);
  return sendSuccess(res, record, 'Advance/Loan rejected');
});

export const deleteAdvanceHandler = asyncHandler(async (req: Request, res: Response) => {
  await advancesService.deleteAdvance(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Advance/Loan deleted successfully');
});

export const addRecoveryHandler = asyncHandler(async (req: Request, res: Response) => {
  const recovery = await advancesService.addRecovery(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, recovery, 'Recovery recorded successfully', 201);
});
