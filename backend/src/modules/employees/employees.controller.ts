import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPaginationMeta, sendSuccess } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import * as employeesService from './employees.service';

export const listEmployeesHandler = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req, 'createdAt');
  const filters = {
    projectId: req.query.projectId as string | undefined,
    departmentId: req.query.departmentId as string | undefined,
    designationId: req.query.designationId as string | undefined,
    status: req.query.status as string | undefined,
  };
  const { rows, total } = await employeesService.listEmployees(req, pagination, filters);
  return sendSuccess(res, rows, 'Employees fetched', 200, buildPaginationMeta(pagination.page, pagination.pageSize, total));
});

export const getEmployeeHandler = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.getEmployee(req, req.params.id);
  return sendSuccess(res, employee, 'Employee fetched');
});

export const createEmployeeHandler = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.createEmployee(req, req.body, req.meta);
  return sendSuccess(res, employee, 'Employee created successfully', 201);
});

export const updateEmployeeHandler = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.updateEmployee(req, req.params.id, req.body, req.meta);
  return sendSuccess(res, employee, 'Employee updated successfully');
});

export const deleteEmployeeHandler = asyncHandler(async (req: Request, res: Response) => {
  await employeesService.deleteEmployee(req, req.params.id, req.meta);
  return sendSuccess(res, null, 'Employee deleted successfully');
});

export const convertCandidateHandler = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.createEmployeeFromCandidate(req, req.params.candidateId, req.meta);
  return sendSuccess(res, employee, 'Candidate converted to employee successfully', 201);
});
