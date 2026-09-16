import { Request, Response } from 'express';
import { BillingItemStatus } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as billingStatusService from './billingStatus.service';
import { BillingItemFilters } from './billingStatus.service';

function parseFilters(req: Request): BillingItemFilters {
  return {
    projectId: req.query.projectId as string | undefined,
    billingMonth: req.query.billingMonth ? Number(req.query.billingMonth) : undefined,
    billingYear: req.query.billingYear ? Number(req.query.billingYear) : undefined,
    periodFrom: req.query.periodFrom ? new Date(req.query.periodFrom as string) : undefined,
    periodTo: req.query.periodTo ? new Date(req.query.periodTo as string) : undefined,
    plantUnit: req.query.plantUnit as string | undefined,
    status: req.query.status as BillingItemStatus | undefined,
    invoiceNo: req.query.invoiceNo as string | undefined,
    jmsNo: req.query.jmsNo as string | undefined,
  };
}

export const listBillingItemsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const { rows, total } = await billingStatusService.listBillingItems(req, pagination, parseFilters(req));
  return sendSuccess(res, rows, 'Billing items fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getBillingSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const summary = await billingStatusService.getBillingSummary(req, parseFilters(req));
  return sendSuccess(res, summary, 'Billing summary fetched');
});

export const getBillingRecordHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await billingStatusService.getBillingRecord(req, req.params.id);
  return sendSuccess(res, record, 'Billing record fetched');
});

export const createBillingRecordHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await billingStatusService.createBillingRecord(req, req.body, req.meta);
  return sendSuccess(res, record, 'Billing record created successfully', 201);
});

export const updateBillingRecordHandler = asyncHandler(async (req: Request, res: Response) => {
  const record = await billingStatusService.updateBillingRecord(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, record, 'Billing record updated successfully');
});

export const deleteBillingRecordHandler = asyncHandler(async (req: Request, res: Response) => {
  await billingStatusService.deleteBillingRecord(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Billing record deleted successfully');
});

export const updateBillingItemHandler = asyncHandler(async (req: Request, res: Response) => {
  const item = await billingStatusService.updateBillingItem(req, req.params.itemId, req.body, req.meta);
  return sendSuccess(res, item, 'Billing item updated successfully');
});

export const deleteBillingItemHandler = asyncHandler(async (req: Request, res: Response) => {
  await billingStatusService.deleteBillingItem(req, req.params.itemId, req.meta);
  return sendSuccess(res, null, 'Billing item deleted successfully');
});
