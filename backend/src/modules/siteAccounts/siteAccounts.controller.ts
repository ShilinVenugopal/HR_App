import { Request, Response } from 'express';
import { SiteAccountStatementStatus } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as siteAccountsService from './siteAccounts.service';
import { StatementFilters } from './siteAccounts.service';

function parseFilters(req: Request): StatementFilters {
  return {
    projectId: req.query.projectId as string | undefined,
    projectNumber: req.query.projectNumber as string | undefined,
    periodFrom: req.query.periodFrom ? new Date(req.query.periodFrom as string) : undefined,
    periodTo: req.query.periodTo ? new Date(req.query.periodTo as string) : undefined,
    statementMonth: req.query.statementMonth ? Number(req.query.statementMonth) : undefined,
    statementYear: req.query.statementYear ? Number(req.query.statementYear) : undefined,
    status: req.query.status as SiteAccountStatementStatus | undefined,
    voucherNo: req.query.voucherNo as string | undefined,
    costCode: req.query.costCode as string | undefined,
  };
}

export const listCostCodesHandler = asyncHandler(async (req: Request, res: Response) => {
  const rows = await siteAccountsService.listCostCodes();
  return sendSuccess(res, rows, 'Site Account cost codes fetched');
});

export const listStatementsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const { rows, total } = await siteAccountsService.listStatements(req, pagination, parseFilters(req));
  return sendSuccess(res, rows, 'Site Account statements fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const statement = await siteAccountsService.getStatement(req, req.params.id);
  return sendSuccess(res, statement, 'Site Account statement fetched');
});

export const createStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const statement = await siteAccountsService.createStatement(req, req.body, req.meta);
  return sendSuccess(res, statement, 'Site Account statement created successfully', 201);
});

export const updateStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const statement = await siteAccountsService.updateStatement(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, statement, 'Site Account statement updated successfully');
});

export const saveStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const statement = await siteAccountsService.saveStatement(req, req.params.id, req.meta);
  return sendSuccess(res, statement, 'Statement saved');
});

export const deleteStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  await siteAccountsService.deleteStatement(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Site Account statement deleted successfully');
});
