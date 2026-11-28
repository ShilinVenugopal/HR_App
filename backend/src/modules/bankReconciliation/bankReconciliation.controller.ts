import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as svc from './bankReconciliation.service';

export const generateStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const statement = await svc.generateStatement(req.body);
  return sendSuccess(res, statement, 'Reconciliation statement generated');
});

export const saveReconciliationHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await svc.saveReconciliation(req, req.body, req.meta);
  return sendSuccess(res, record, 'Reconciliation saved to history successfully', 201);
});

export const listHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'reconciledAt');
  const { rows, total } = await svc.listReconciliationHistory(pagination, { bankAccountId: req.query.bankAccountId as string | undefined });
  return sendSuccess(res, rows, 'Reconciliation history fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});
