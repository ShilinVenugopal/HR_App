import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import { ApiError } from '../../utils/apiError';
import * as recruitmentService from './recruitment.service';

export const listCandidatesHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const filters = {
    projectId: req.query.projectId as string | undefined,
    designationId: req.query.designationId as string | undefined,
    status: req.query.status as string | undefined,
    foraysInterviewStatus: req.query.foraysInterviewStatus as string | undefined,
    clientInterviewStatus: req.query.clientInterviewStatus as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    experience: req.query.experience as string | undefined,
  };
  const { rows, total } = await recruitmentService.listCandidates(req, pagination, filters);
  return sendSuccess(res, rows, 'Candidates fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getCandidateHandler = asyncHandler(async (req: Request, res: Response) => {
  const candidate = await recruitmentService.getCandidate(req, req.params.id);
  return sendSuccess(res, candidate, 'Candidate fetched');
});

export const createCandidateHandler = asyncHandler(async (req: Request, res: Response) => {
  const candidate = await recruitmentService.createCandidate(req, req.body, req.meta);
  return sendSuccess(res, candidate, 'Candidate added successfully', 201);
});

export const updateCandidateHandler = asyncHandler(async (req: Request, res: Response) => {
  const candidate = await recruitmentService.updateCandidate(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, candidate, 'Candidate updated successfully');
});

export const deleteCandidateHandler = asyncHandler(async (req: Request, res: Response) => {
  await recruitmentService.deleteCandidate(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Candidate deleted successfully');
});

export const checkDuplicatesHandler = asyncHandler(async (req: Request, res: Response) => {
  const matches = await recruitmentService.checkDuplicateContacts(req, req.body.contactNumbers);
  return sendSuccess(res, matches, 'Duplicate check complete');
});

export const bulkImportHandler = asyncHandler(async (req: Request, res: Response) => {
  // The route is gated on RECRUITMENT 'add' (bulk import is primarily an
  // add flow), but "Update Existing" for duplicates is really an edit —
  // require that permission too before allowing that strategy.
  if (req.body.duplicateStrategy === 'update' && !req.user!.permissions.RECRUITMENT?.canEdit && req.user!.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('You do not have permission to update existing candidates');
  }

  const result = await recruitmentService.bulkImportCandidates(req, req.body.rows, req.body.duplicateStrategy, req.meta);
  return sendSuccess(res, result, 'Bulk import complete');
});
