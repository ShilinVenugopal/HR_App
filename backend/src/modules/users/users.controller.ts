import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as usersService from './users.service';

export const listUsersHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const { rows, total } = await usersService.listUsers(pagination);
  return sendSuccess(res, rows, 'Users fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.getUserDetail(req.params.id);
  return sendSuccess(res, user, 'User fetched');
});

export const createUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.createUser(req.body, req.user!.sub, req.meta);
  return sendSuccess(res, user, 'User created successfully', 201);
});

export const updateUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.updateUser(req.params.id, req.body, req.user!.sub, req.meta);
  return sendSuccess(res, user, 'User updated successfully');
});

export const disableUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.setUserStatus(req.params.id, 'DISABLED', req.user!.sub, req.meta);
  return sendSuccess(res, user, 'User disabled');
});

export const enableUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.setUserStatus(req.params.id, 'ACTIVE', req.user!.sub, req.meta);
  return sendSuccess(res, user, 'User enabled');
});

export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  await usersService.resetUserPassword(req.params.id, req.body.newPassword, req.user!.sub, req.meta);
  return sendSuccess(res, null, 'Password reset successfully');
});

export const deleteUserHandler = asyncHandler(async (req: Request, res: Response) => {
  await usersService.deleteUser(req.params.id, req.user!.sub, req.meta);
  return sendSuccess(res, null, 'User deleted successfully');
});
