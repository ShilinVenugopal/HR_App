import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { getProcurementDashboardSummary } from './procurementDashboard.service';

export const getProcurementDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const summary = await getProcurementDashboardSummary(req);
  return sendSuccess(res, summary, 'Procurement dashboard summary fetched');
});
