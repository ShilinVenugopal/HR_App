import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as expensesService from './expenses.service';

export const listExpensesHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req);
  const filters = {
    projectId: req.query.projectId as string | undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    month: req.query.month ? Number(req.query.month) : undefined,
    monthFrom: req.query.monthFrom ? Number(req.query.monthFrom) : undefined,
    monthTo: req.query.monthTo ? Number(req.query.monthTo) : undefined,
  };
  const { rows, total } = await expensesService.listExpenses(req, pagination, filters);
  return sendSuccess(res, rows, 'Expenses fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const lookupExpenseHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await expensesService.findExpenseByPeriod(
    req,
    req.query.projectId as string,
    Number(req.query.year),
    Number(req.query.month)
  );
  return sendSuccess(res, record, record ? 'Existing expense record found' : 'No expense record found for this period');
});

export const getExpenseHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await expensesService.getExpense(req, req.params.id);
  return sendSuccess(res, record, 'Expense record fetched');
});

export const createExpenseHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await expensesService.createExpense(req, req.body, req.user!.sub, req.meta);
  return sendSuccess(res, record, 'Expense saved successfully', 201);
});

export const updateExpenseHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await expensesService.updateExpense(req, req.params.id, req.body, req.user!.sub, req.meta);
  return sendSuccess(res, record, 'Expense updated successfully');
});

export const deleteExpenseHandler = asyncHandler(async (req: Request, res: Response) => {
  await expensesService.deleteExpense(req, req.params.id, req.user!.sub, req.meta);
  return sendSuccess(res, null, 'Expense deleted successfully');
});
