import { Request, Response } from 'express';
import { BankAccountStatus } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import * as svc from './bankAccounts.service';

export const listBankAccountsHandler = asyncHandler(async (req: Request, res: Response) => {
  const accounts = await svc.listBankAccounts(req.query.status as BankAccountStatus | undefined);
  return sendSuccess(res, accounts, 'Bank accounts fetched');
});

export const listBankAccountOptionsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const options = await svc.listBankAccountOptions();
  return sendSuccess(res, options, 'Bank account options fetched');
});

export const getBankAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  const account = await svc.getBankAccount(req.params.id);
  return sendSuccess(res, account, 'Bank account fetched');
});

export const createBankAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  const account = await svc.createBankAccount(req, req.body, req.meta);
  return sendSuccess(res, account, 'Bank account created successfully', 201);
});

export const updateBankAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  const account = await svc.updateBankAccount(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, account, 'Bank account updated successfully');
});
