import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import * as projectWagesService from './projectWages.service';

export const listTemplatesHandler = asyncHandler(async (req: Request, res: Response) => {
  const templates = await projectWagesService.listTemplates(req);
  return sendSuccess(res, templates, 'Wage templates fetched');
});

export const getTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const template = await projectWagesService.getTemplateDetail(req, req.params.code);
  return sendSuccess(res, template, 'Wage template fetched');
});

export const listEntriesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { month, year, search } = req.query;
  const result = await projectWagesService.listEntries(req, req.params.code, Number(month), Number(year), search as string | undefined);
  return sendSuccess(res, result, 'Wage entries fetched');
});

export const getSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const { month, year } = req.query;
  const summary = await projectWagesService.getSummary(req, req.params.code, Number(month), Number(year));
  return sendSuccess(res, summary, 'Wage summary fetched');
});

export const getHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await projectWagesService.getEmployeeHistory(req, req.params.code, req.params.employeeCode);
  return sendSuccess(res, result, 'Employee wage history fetched');
});

export const createEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await projectWagesService.createEntry(req, req.params.code, req.body, req.meta);
  return sendSuccess(res, entry, 'Wage entry created', 201);
});

export const updateEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const entry = await projectWagesService.updateEntry(req, req.params.code, req.params.id, req.body.values, req.meta);
  return sendSuccess(res, entry, 'Wage entry updated');
});

export const deleteEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  await projectWagesService.deleteEntry(req, req.params.code, req.params.id, req.meta);
  return sendSuccess(res, null, 'Wage entry deleted');
});

export const importHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await projectWagesService.importWages(req, req.params.code, req.body, req.meta);
  return sendSuccess(res, result, 'Wage sheet imported', 201);
});
