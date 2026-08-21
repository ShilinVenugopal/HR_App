import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import * as projectUnitsService from './projectUnits.service';

export const listProjectUnitsHandler = asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.query.projectId as string | undefined;
  const status = req.query.status as string | undefined;
  const units = await projectUnitsService.listProjectUnits(req, projectId, status);
  return sendSuccess(res, units, 'Units fetched');
});

export const getProjectUnitHandler = asyncHandler(async (req: Request, res: Response) => {
  const unit = await projectUnitsService.getProjectUnit(req, req.params.id);
  return sendSuccess(res, unit, 'Unit fetched');
});

export const createProjectUnitHandler = asyncHandler(async (req: Request, res: Response) => {
  const unit = await projectUnitsService.createProjectUnit(req, req.body, req.user!.sub, req.meta);
  return sendSuccess(res, unit, 'Unit created successfully', 201);
});

export const updateProjectUnitHandler = asyncHandler(async (req: Request, res: Response) => {
  const unit = await projectUnitsService.updateProjectUnit(req, req.params.id, req.body, req.user!.sub, req.meta);
  return sendSuccess(res, unit, 'Unit updated successfully');
});

export const deleteProjectUnitHandler = asyncHandler(async (req: Request, res: Response) => {
  await projectUnitsService.deleteProjectUnit(req, req.params.id, req.user!.sub, req.meta);
  return sendSuccess(res, null, 'Unit deleted successfully');
});
