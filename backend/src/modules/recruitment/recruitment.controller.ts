import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
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
