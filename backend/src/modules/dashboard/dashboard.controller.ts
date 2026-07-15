import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { getDashboardSummary } from './dashboard.service';

export const getDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const summary = await getDashboardSummary(req);
  return sendSuccess(res, summary, 'Dashboard summary fetched');
});
