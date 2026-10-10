import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { PaginationParams } from '../../utils/pagination';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const includeRelations = {
  project: { select: { id: true, projectName: true, projectNumber: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseInclude;

/// The columns counted into Total Amount — Total manpower Net Salary
/// through Misc. (columns G through W in the reference "Expense
/// adding.xlsx" template's =SUM(G3:W3)). Manpower (a headcount, not
/// money) and Basic Salary are deliberately excluded, matching the
/// template's own formula exactly.
const TOTAL_AMOUNT_FIELDS = [
  'totalManpowerNetSalary',
  'leavePay',
  'bonus',
  'pf',
  'esic',
  'transportation',
  'accommodation',
  'operationalCost',
  'labLicenseBgFund',
  'ppe',
  'coverall',
  'medicalExpense',
  'toolsAndMachinery',
  'mobDemobCost',
  'insurance',
  'consumables',
  'misc',
] as const;

type TotalAmountFields = Record<(typeof TOTAL_AMOUNT_FIELDS)[number], number>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeTotalAmount(fields: TotalAmountFields): number {
  return round2(TOTAL_AMOUNT_FIELDS.reduce((sum, key) => sum + (fields[key] ?? 0), 0));
}

export interface ExpenseFilters {
  projectId?: string;
  year?: number;
  month?: number;
  monthFrom?: number;
  monthTo?: number;
}

export async function listExpenses(req: Request, pagination: PaginationParams, filters: ExpenseFilters) {
  const where: Prisma.ExpenseWhereInput = {
    ...projectScopeWhere(req),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.year ? { year: filters.year } : {}),
    ...(filters.month ? { month: filters.month } : {}),
    ...(filters.monthFrom || filters.monthTo
      ? {
          month: {
            ...(filters.monthFrom ? { gte: filters.monthFrom } : {}),
            ...(filters.monthTo ? { lte: filters.monthTo } : {}),
          },
        }
      : {}),
  };

  // parsePagination() always defaults sortBy to 'createdAt', so an
  // explicit user sort request is distinguished from "no sort chosen" by
  // reading req.query directly rather than the already-defaulted
  // PaginationParams.sortBy — otherwise the natural Year/Month-desc
  // default below could never apply.
  const explicitSortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;

  const [rows, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: includeRelations,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: explicitSortBy ? { [explicitSortBy]: pagination.sortOrder } : [{ year: 'desc' }, { month: 'desc' }],
    }),
    prisma.expense.count({ where }),
  ]);

  return { rows, total };
}

async function loadAndAuthorize(req: Request, id: string) {
  const record = await prisma.expense.findUnique({ where: { id }, include: includeRelations });
  if (!record) throw ApiError.notFound('Expense record not found');
  assertProjectAccess(req, record.projectId);
  return record;
}

export async function getExpense(req: Request, id: string) {
  return loadAndAuthorize(req, id);
}

/// Backs the "already exists — edit instead of duplicating" UX: the
/// frontend calls this the moment Project+Year+Month are all selected, so
/// it can show the existing record for editing rather than a blank form.
export async function findExpenseByPeriod(req: Request, projectId: string, year: number, month: number) {
  assertProjectAccess(req, projectId);
  return prisma.expense.findUnique({ where: { projectId_year_month: { projectId, year, month } }, include: includeRelations });
}

export interface ExpenseInput {
  projectId: string;
  year: number;
  month: number;
  uom?: string;
  manpower: number;
  basicSalary?: number;
  totalManpowerNetSalary: number;
  leavePay?: number;
  bonus?: number;
  pf?: number;
  esic?: number;
  transportation?: number;
  accommodation?: number;
  operationalCost?: number;
  labLicenseBgFund?: number;
  ppe?: number;
  coverall?: number;
  medicalExpense?: number;
  toolsAndMachinery?: number;
  mobDemobCost?: number;
  insurance?: number;
  consumables?: number;
  misc?: number;
}

export async function createExpense(req: Request, input: ExpenseInput, actingUserId: string, meta?: RequestMeta) {
  assertProjectAccess(req, input.projectId);

  const existing = await prisma.expense.findUnique({
    where: { projectId_year_month: { projectId: input.projectId, year: input.year, month: input.month } },
  });
  if (existing) {
    throw ApiError.conflict('An expense record already exists for this Project, Year and Month — edit the existing record instead.');
  }

  const totalAmount = computeTotalAmount(input as unknown as TotalAmountFields);

  const record = await prisma.expense.create({
    data: {
      projectId: input.projectId,
      year: input.year,
      month: input.month,
      uom: (input.uom as Prisma.ExpenseUncheckedCreateInput['uom']) || null,
      manpower: input.manpower,
      basicSalary: input.basicSalary ?? 0,
      totalManpowerNetSalary: input.totalManpowerNetSalary,
      leavePay: input.leavePay ?? 0,
      bonus: input.bonus ?? 0,
      pf: input.pf ?? 0,
      esic: input.esic ?? 0,
      transportation: input.transportation ?? 0,
      accommodation: input.accommodation ?? 0,
      operationalCost: input.operationalCost ?? 0,
      labLicenseBgFund: input.labLicenseBgFund ?? 0,
      ppe: input.ppe ?? 0,
      coverall: input.coverall ?? 0,
      medicalExpense: input.medicalExpense ?? 0,
      toolsAndMachinery: input.toolsAndMachinery ?? 0,
      mobDemobCost: input.mobDemobCost ?? 0,
      insurance: input.insurance ?? 0,
      consumables: input.consumables ?? 0,
      misc: input.misc ?? 0,
      totalAmount,
      createdById: actingUserId,
      updatedById: actingUserId,
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: actingUserId,
    action: 'CREATE',
    module: 'EXPENSE',
    projectId: record.projectId,
    status: 'SUCCESS',
    meta,
    details: { expenseId: record.id, year: record.year, month: record.month, totalAmount },
  });

  return record;
}

export async function updateExpense(req: Request, id: string, input: Partial<Omit<ExpenseInput, 'projectId' | 'year' | 'month'>>, actingUserId: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);

  const merged: TotalAmountFields = {
    totalManpowerNetSalary: input.totalManpowerNetSalary ?? Number(existing.totalManpowerNetSalary),
    leavePay: input.leavePay ?? Number(existing.leavePay),
    bonus: input.bonus ?? Number(existing.bonus),
    pf: input.pf ?? Number(existing.pf),
    esic: input.esic ?? Number(existing.esic),
    transportation: input.transportation ?? Number(existing.transportation),
    accommodation: input.accommodation ?? Number(existing.accommodation),
    operationalCost: input.operationalCost ?? Number(existing.operationalCost),
    labLicenseBgFund: input.labLicenseBgFund ?? Number(existing.labLicenseBgFund),
    ppe: input.ppe ?? Number(existing.ppe),
    coverall: input.coverall ?? Number(existing.coverall),
    medicalExpense: input.medicalExpense ?? Number(existing.medicalExpense),
    toolsAndMachinery: input.toolsAndMachinery ?? Number(existing.toolsAndMachinery),
    mobDemobCost: input.mobDemobCost ?? Number(existing.mobDemobCost),
    insurance: input.insurance ?? Number(existing.insurance),
    consumables: input.consumables ?? Number(existing.consumables),
    misc: input.misc ?? Number(existing.misc),
  };
  const totalAmount = computeTotalAmount(merged);

  const record = await prisma.expense.update({
    where: { id },
    data: {
      uom: input.uom !== undefined ? ((input.uom as Prisma.ExpenseUncheckedUpdateInput['uom']) || null) : undefined,
      manpower: input.manpower,
      basicSalary: input.basicSalary,
      ...merged,
      totalAmount,
      updatedById: actingUserId,
    },
    include: includeRelations,
  });

  await recordAuditLog({
    userId: actingUserId,
    action: 'UPDATE',
    module: 'EXPENSE',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { expenseId: id, changes: input, totalAmount },
  });

  return record;
}

export async function deleteExpense(req: Request, id: string, actingUserId: string, meta?: RequestMeta) {
  const existing = await loadAndAuthorize(req, id);

  await prisma.expense.delete({ where: { id } });

  await recordAuditLog({
    userId: actingUserId,
    action: 'DELETE',
    module: 'EXPENSE',
    projectId: existing.projectId,
    status: 'SUCCESS',
    meta,
    details: { expenseId: id, year: existing.year, month: existing.month },
  });
}
