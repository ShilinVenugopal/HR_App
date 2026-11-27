import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as svc from './subcontractorPayments.service';
import { SubcontractorBillFilters, SubcontractorBillPaymentStatus } from './subcontractorPayments.service';

function parseFilters(req: Request): SubcontractorBillFilters {
  return {
    projectId: req.query.projectId as string | undefined,
    subcontractorId: req.query.subcontractorId as string | undefined,
    billingMonth: req.query.billingMonth ? Number(req.query.billingMonth) : undefined,
    billingYear: req.query.billingYear ? Number(req.query.billingYear) : undefined,
    invoiceNumber: req.query.invoiceNumber as string | undefined,
    paymentStatus: req.query.paymentStatus as SubcontractorBillPaymentStatus | undefined,
  };
}

export const listBillsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const { rows, total } = await svc.listSubcontractorBills(req, pagination, parseFilters(req));
  return sendSuccess(res, rows, 'Subcontractor bills fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getBillTotalsHandler = asyncHandler(async (req: Request, res: Response) => {
  const totals = await svc.getSubcontractorBillTotals(req, parseFilters(req));
  return sendSuccess(res, totals, 'Subcontractor bill totals fetched');
});

export const getBillHandler = asyncHandler(async (req: Request, res: Response) => {
  const bill = await svc.getSubcontractorBill(req, req.params.id);
  return sendSuccess(res, bill, 'Subcontractor bill fetched');
});

export const createBillHandler = asyncHandler(async (req: Request, res: Response) => {
  const bill = await svc.createSubcontractorBill(req, req.body, req.meta);
  return sendSuccess(res, bill, 'Subcontractor bill created successfully', 201);
});

export const updateBillHandler = asyncHandler(async (req: Request, res: Response) => {
  const bill = await svc.updateSubcontractorBill(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, bill, 'Subcontractor bill updated successfully');
});

export const deleteBillHandler = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteSubcontractorBill(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Subcontractor bill deleted successfully');
});

export const addPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const bill = await svc.addPaymentTransaction(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, bill, 'Payment processing entry recorded successfully', 201);
});

export const updatePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const bill = await svc.updatePaymentTransaction(req, req.params.paymentId, req.body, req.meta);
  return sendSuccess(res, bill, 'Payment processing entry updated successfully');
});

export const deletePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const bill = await svc.deletePaymentTransaction(req, req.params.paymentId, req.meta);
  return sendSuccess(res, bill, 'Payment processing entry deleted successfully');
});

export const getPaymentDueHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req);
  const result = await svc.getSubcontractorPaymentDue(
    req,
    {
      projectId: req.query.projectId as string | undefined,
      subcontractorId: req.query.subcontractorId as string | undefined,
      billingMonth: req.query.billingMonth ? Number(req.query.billingMonth) : undefined,
      billingYear: req.query.billingYear ? Number(req.query.billingYear) : undefined,
    },
    pagination
  );
  // One extra field (totalOutstanding) alongside the usual pagination meta
  // — built manually rather than through sendSuccess, whose meta type is
  // fixed to page/pageSize/total/totalPages.
  return res.status(200).json({
    success: true,
    message: 'Subcontractor payment due fetched',
    data: result.rows,
    meta: { ...buildPaginationMeta(pagination.page, pagination.pageSize, result.total), totalOutstanding: result.totalOutstanding },
  });
});
