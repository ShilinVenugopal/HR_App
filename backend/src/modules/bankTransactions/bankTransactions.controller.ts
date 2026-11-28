import { Request, Response } from 'express';
import { BankSourceModule } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as svc from './bankTransactions.service';
import { TransactionFilters } from './bankTransactions.service';

function parseFilters(req: Request, transactionType: 'RECEIPT' | 'PAYMENT'): TransactionFilters {
  return {
    transactionType,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    projectId: req.query.projectId as string | undefined,
    accountType: req.query.accountType as 'OD' | 'CURRENT' | 'CC' | undefined,
    bankAccountId: req.query.bankAccountId as string | undefined,
    description: req.query.description as string | undefined,
    sourceModule: req.query.sourceModule as BankSourceModule | undefined,
  };
}

/// totalAmount sits alongside the usual pagination meta — built manually
/// (not via sendSuccess, whose meta type is fixed to page/pageSize/total/
/// totalPages) since both list endpoints need one extra field.
function sendList(res: Response, message: string, pagination: ReturnType<typeof parsePagination>, result: { rows: unknown[]; total: number; totalAmount: number }) {
  return res.status(200).json({
    success: true,
    message,
    data: result.rows,
    meta: { ...buildPaginationMeta(pagination.page, pagination.pageSize, result.total), totalAmount: result.totalAmount },
  });
}

export const listReceiptsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req);
  const result = await svc.listTransactions(req, pagination, parseFilters(req, 'RECEIPT'));
  return sendList(res, 'Receipts fetched', pagination, result);
});

export const listPaymentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req);
  const result = await svc.listTransactions(req, pagination, parseFilters(req, 'PAYMENT'));
  return sendList(res, 'Payments fetched', pagination, result);
});

export const getTransactionHandler = asyncHandler(async (req: Request, res: Response) => {
  const tx = await svc.getTransaction(req.params.id);
  return sendSuccess(res, tx, 'Bank transaction fetched');
});

export const updateTransactionHandler = asyncHandler(async (req: Request, res: Response) => {
  const tx = await svc.updateTransaction(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, tx, 'Bank transaction updated successfully');
});

export const createManualTransactionHandler = asyncHandler(async (req: Request, res: Response) => {
  const tx = await svc.createManualTransaction(req, req.body, req.meta);
  return sendSuccess(res, tx, 'Transaction recorded successfully', 201);
});

export const deleteManualTransactionHandler = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteManualTransaction(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Transaction deleted successfully');
});

export const createTransferHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await svc.createTransfer(req, req.body, req.meta);
  return sendSuccess(res, result, 'Internal transfer recorded successfully', 201);
});
