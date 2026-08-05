import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import * as poTermsService from './poTerms.service';

export const listPoTermsHandler = asyncHandler(async (req: Request, res: Response) => {
  const terms = await poTermsService.listPoTerms();
  return sendSuccess(res, terms, 'Purchase Order Terms & Conditions fetched');
});

export const replacePoTermsHandler = asyncHandler(async (req: Request, res: Response) => {
  const terms = await poTermsService.replacePoTerms(req.body.items, req.user!.sub, req.meta);
  return sendSuccess(res, terms, 'Terms & Conditions updated successfully');
});
