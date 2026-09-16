import { Request, Response } from 'express';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as ticketsService from './tickets.service';

export const listTicketsHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req);
  const filters = {
    scope: req.query.scope as 'mine' | 'assigned' | 'all' | undefined,
    status: req.query.status as TicketStatus | undefined,
    priority: req.query.priority as TicketPriority | undefined,
    categoryId: req.query.categoryId as string | undefined,
    raisedById: req.query.raisedById as string | undefined,
    assignedToId: req.query.assignedToId as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
  };
  const { rows, total } = await ticketsService.listTickets(req, pagination, filters);
  return sendSuccess(res, rows, 'Tickets fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const assignableUsersHandler = asyncHandler(async (_req: Request, res: Response) => {
  const users = await ticketsService.listAssignableUsers();
  return sendSuccess(res, users, 'Assignable users fetched');
});

export const dashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const stats = await ticketsService.getDashboardStats(req);
  return sendSuccess(res, stats, 'Ticket dashboard stats fetched');
});

export const getTicketHandler = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketsService.getTicketDetail(req, req.params.id);
  return sendSuccess(res, ticket, 'Ticket fetched');
});

export const createTicketHandler = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketsService.createTicket(req, req.body, req.meta);
  return sendSuccess(res, ticket, `Ticket ${ticket.ticketNo} has been created successfully`, 201);
});

export const addCommentHandler = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketsService.addComment(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, ticket, 'Comment added');
});

export const changeStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketsService.changeStatus(req, req.params.id, req.body.status, req.meta);
  return sendSuccess(res, ticket, 'Ticket status updated');
});

export const changePriorityHandler = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketsService.changePriority(req, req.params.id, req.body.priority, req.meta);
  return sendSuccess(res, ticket, 'Ticket priority updated');
});

export const manageAssigneesHandler = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketsService.manageAssignees(req, req.params.id, req.body.assigneeIds, req.meta);
  return sendSuccess(res, ticket, 'Assignees updated');
});

export const attachFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketsService.attachFile(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, ticket, 'Attachment added');
});

export const deleteTicketHandler = asyncHandler(async (req: Request, res: Response) => {
  await ticketsService.deleteTicket(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Ticket deleted successfully');
});
