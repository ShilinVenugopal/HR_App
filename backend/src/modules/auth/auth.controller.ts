import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import * as authService from './auth.service';

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password, req.meta);
  return sendSuccess(res, result, 'Login successful');
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const result = await authService.refreshSession(refreshToken, req.meta);
  return sendSuccess(res, result, 'Session refreshed');
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req.user!.sub, req.body?.refreshToken, req.meta);
  return sendSuccess(res, null, 'Logged out');
});

export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  const { sub, email, name, role, projects, permissions } = req.user!;
  return sendSuccess(res, { id: sub, email, name, role, projects, permissions }, 'Current session');
});

export const changePasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changeOwnPassword(req.user!.sub, currentPassword, newPassword, req.meta);
  return sendSuccess(res, null, 'Password changed successfully');
});
