import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as projectsService from './projects.service';

export const listProjectsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'projectName');
  const { rows, total } = await projectsService.listProjects(req, pagination);
  return sendSuccess(res, rows, 'Projects fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getProjectHandler = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectsService.getProject(req.params.id);
  return sendSuccess(res, project, 'Project fetched');
});

export const createProjectHandler = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectsService.createProject(req.body, req.user!.sub, req.meta);
  return sendSuccess(res, project, 'Project created successfully', 201);
});

export const updateProjectHandler = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectsService.updateProject(req.params.id, req.body, req.user!.sub, req.meta);
  return sendSuccess(res, project, 'Project updated successfully');
});

export const deleteProjectHandler = asyncHandler(async (req: Request, res: Response) => {
  await projectsService.deleteProject(req.params.id, req.user!.sub, req.meta);
  return sendSuccess(res, null, 'Project deleted successfully');
});
