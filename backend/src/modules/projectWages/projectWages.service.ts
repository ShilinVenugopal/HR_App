import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { assertProjectAccess, projectScopeWhere } from '../../middleware/project.middleware';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';
import { computeRow, round2, WageRowValues } from './formulaEngine';
import { WageColumnDef } from './wageColumns.types';

function employeeIdKey(columns: WageColumnDef[]): string {
  const col = columns.find((c) => c.isEmployeeId);
  if (!col) throw new Error('Template has no isEmployeeId column configured');
  return col.key;
}

function employeeNameKey(columns: WageColumnDef[]): string {
  const col = columns.find((c) => c.isEmployeeName);
  if (!col) throw new Error('Template has no isEmployeeName column configured');
  return col.key;
}

function deriveTotals(columns: WageColumnDef[], computed: WageRowValues) {
  const grossCol = columns.find((c) => c.isGrossTotal);
  const deductionsCol = columns.find((c) => c.isDeductionsTotal);
  const netCol = columns.find((c) => c.isNetTotal);
  const num = (key?: string) => (key ? Number(computed[key] ?? 0) : 0);
  return {
    grossSalary: round2(num(grossCol?.key)),
    totalDeductions: round2(num(deductionsCol?.key)),
    netSalary: round2(num(netCol?.key)),
  };
}

async function getTemplateOrThrow(code: string) {
  const template = await prisma.wageProjectTemplate.findUnique({
    where: { code },
    include: { project: { select: { id: true, projectName: true, status: true } } },
  });
  if (!template || !template.active) throw ApiError.notFound('Wage template not found');
  return template;
}

export async function listTemplates(req: Request) {
  const templates = await prisma.wageProjectTemplate.findMany({
    where: { active: true, project: projectScopeWhere(req, 'id') },
    include: { project: { select: { id: true, projectName: true } } },
    orderBy: { name: 'asc' },
  });
  return templates.map((t) => ({ code: t.code, name: t.name, projectId: t.projectId, projectName: t.project.projectName }));
}

export async function getTemplateDetail(req: Request, code: string) {
  const template = await getTemplateOrThrow(code);
  assertProjectAccess(req, template.projectId);
  return { code: template.code, name: template.name, projectId: template.projectId, projectName: template.project.projectName, columns: template.columns };
}

export async function listEntries(req: Request, code: string, month: number, year: number, search?: string) {
  const template = await getTemplateOrThrow(code);
  assertProjectAccess(req, template.projectId);

  const where: Prisma.WageEntryWhereInput = {
    templateId: template.id,
    month,
    year,
    ...(search ? { employeeName: { contains: search, mode: 'insensitive' } } : {}),
  };

  const entries = await prisma.wageEntry.findMany({ where, orderBy: { createdAt: 'asc' } });
  return { columns: template.columns as unknown as WageColumnDef[], entries };
}

export async function getSummary(req: Request, code: string, month: number, year: number) {
  const template = await getTemplateOrThrow(code);
  assertProjectAccess(req, template.projectId);

  const agg = await prisma.wageEntry.aggregate({
    where: { templateId: template.id, month, year },
    _count: { _all: true },
    _sum: { grossSalary: true, totalDeductions: true, netSalary: true },
  });

  return {
    totalEmployees: agg._count._all,
    grossSalary: Number(agg._sum.grossSalary ?? 0),
    totalDeductions: Number(agg._sum.totalDeductions ?? 0),
    netSalary: Number(agg._sum.netSalary ?? 0),
  };
}

export async function getEmployeeHistory(req: Request, code: string, employeeCode: string) {
  const template = await getTemplateOrThrow(code);
  assertProjectAccess(req, template.projectId);

  const entries = await prisma.wageEntry.findMany({
    where: { templateId: template.id, employeeCode },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
  return { columns: template.columns as unknown as WageColumnDef[], entries };
}

export async function createEntry(
  req: Request,
  code: string,
  input: { month: number; year: number; values: WageRowValues },
  meta?: RequestMeta
) {
  const template = await getTemplateOrThrow(code);
  assertProjectAccess(req, template.projectId);

  const columns = template.columns as unknown as WageColumnDef[];
  const idKey = employeeIdKey(columns);
  const nameKey = employeeNameKey(columns);
  const employeeCode = String(input.values[idKey] ?? '').trim();
  const employeeName = String(input.values[nameKey] ?? '').trim();
  if (!employeeCode) throw ApiError.badRequest('Employee ID is required');
  if (!employeeName) throw ApiError.badRequest('Employee Name is required');

  const computed = computeRow(columns, input.values);
  const totals = deriveTotals(columns, computed);

  const entry = await prisma.wageEntry.upsert({
    where: { templateId_month_year_employeeCode: { templateId: template.id, month: input.month, year: input.year, employeeCode } },
    create: {
      templateId: template.id,
      projectId: template.projectId,
      month: input.month,
      year: input.year,
      employeeCode,
      employeeName,
      data: computed as Prisma.InputJsonValue,
      ...totals,
    },
    update: { employeeName, data: computed as Prisma.InputJsonValue, ...totals },
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'WAGES',
    projectId: template.projectId,
    status: 'SUCCESS',
    meta,
    details: { templateCode: code, entryId: entry.id, month: input.month, year: input.year, employeeCode },
  });

  return entry;
}

export async function updateEntry(req: Request, code: string, id: string, values: WageRowValues, meta?: RequestMeta) {
  const template = await getTemplateOrThrow(code);
  assertProjectAccess(req, template.projectId);

  const existing = await prisma.wageEntry.findUnique({ where: { id } });
  if (!existing || existing.templateId !== template.id) throw ApiError.notFound('Wage entry not found');

  const columns = template.columns as unknown as WageColumnDef[];
  const nameKey = employeeNameKey(columns);
  const merged: WageRowValues = { ...(existing.data as WageRowValues), ...values };
  const computed = computeRow(columns, merged);
  const totals = deriveTotals(columns, computed);
  const employeeName = values[nameKey] !== undefined ? String(values[nameKey] ?? '').trim() || existing.employeeName : existing.employeeName;

  const entry = await prisma.wageEntry.update({
    where: { id },
    data: { employeeName, data: computed as Prisma.InputJsonValue, ...totals },
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'WAGES',
    projectId: template.projectId,
    status: 'SUCCESS',
    meta,
    details: { templateCode: code, entryId: id, changes: values },
  });

  return entry;
}

export async function deleteEntry(req: Request, code: string, id: string, meta?: RequestMeta) {
  const template = await getTemplateOrThrow(code);
  assertProjectAccess(req, template.projectId);

  const existing = await prisma.wageEntry.findUnique({ where: { id } });
  if (!existing || existing.templateId !== template.id) throw ApiError.notFound('Wage entry not found');

  await prisma.wageEntry.delete({ where: { id } });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'DELETE',
    module: 'WAGES',
    projectId: template.projectId,
    status: 'SUCCESS',
    meta,
    details: { templateCode: code, entryId: id },
  });
}

export interface ImportRowInput {
  rowNumber: number;
  values: WageRowValues;
}

export interface ImportError {
  row: number;
  message: string;
}

/// Re-validates every row server-side — the frontend runs the same checks
/// for immediate feedback, but a raw API call must never be able to skip
/// them. Never trusts client-computed formula columns either: every
/// formula column is recomputed here from the raw inputs.
export async function importWages(
  req: Request,
  code: string,
  input: { month: number; year: number; fileName: string; fileUrl: string; rows: ImportRowInput[] },
  meta?: RequestMeta
) {
  const template = await getTemplateOrThrow(code);
  assertProjectAccess(req, template.projectId);

  const columns = template.columns as unknown as WageColumnDef[];
  const idKey = employeeIdKey(columns);
  const nameKey = employeeNameKey(columns);

  const hasIdColumnData = input.rows.some((r) => idKey in r.values);
  if (!hasIdColumnData) {
    throw ApiError.badRequest(`Incorrect template — expected column "${columns.find((c) => c.key === idKey)?.label}" was not found`);
  }

  const errors: ImportError[] = [];
  const seenIds = new Set<string>();
  const validRows: { row: ImportRowInput; employeeCode: string; employeeName: string }[] = [];

  const existingByCode = new Map(
    (
      await prisma.wageEntry.findMany({
        where: { templateId: template.id, employeeCode: { in: input.rows.map((r) => String(r.values[idKey] ?? '').trim()).filter(Boolean) } },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      })
    ).map((e) => [e.employeeCode, e.employeeName] as const)
  );

  for (const row of input.rows) {
    const employeeCode = String(row.values[idKey] ?? '').trim();
    const employeeName = String(row.values[nameKey] ?? '').trim();
    const uan = row.values.uan !== undefined && row.values.uan !== null ? String(row.values.uan).trim() : '';

    if (!employeeCode) {
      errors.push({ row: row.rowNumber, message: 'Employee ID Missing' });
      continue;
    }
    if (!employeeName) {
      errors.push({ row: row.rowNumber, message: 'Employee Name Missing' });
      continue;
    }
    if (seenIds.has(employeeCode)) {
      errors.push({ row: row.rowNumber, message: 'Duplicate Employee' });
      continue;
    }
    const priorName = existingByCode.get(employeeCode);
    if (priorName && priorName.trim().toLowerCase() !== employeeName.toLowerCase()) {
      errors.push({ row: row.rowNumber, message: `Employee Name does not match existing record ("${priorName}") for this Employee ID` });
      continue;
    }
    if (uan && !/^\d{12}$/.test(uan)) {
      errors.push({ row: row.rowNumber, message: 'Invalid PF Number' });
      continue;
    }

    seenIds.add(employeeCode);
    validRows.push({ row, employeeCode, employeeName });
  }

  const upload = await prisma.wageUpload.create({
    data: {
      templateId: template.id,
      month: input.month,
      year: input.year,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      status: 'PROCESSING',
      totalRows: input.rows.length,
      uploadedById: req.user!.sub,
    },
  });

  let imported = 0;
  if (validRows.length) {
    await prisma.$transaction(
      validRows.map(({ row, employeeCode, employeeName }) => {
        const computed = computeRow(columns, row.values);
        const totals = deriveTotals(columns, computed);
        return prisma.wageEntry.upsert({
          where: { templateId_month_year_employeeCode: { templateId: template.id, month: input.month, year: input.year, employeeCode } },
          create: {
            templateId: template.id,
            projectId: template.projectId,
            uploadId: upload.id,
            month: input.month,
            year: input.year,
            employeeCode,
            employeeName,
            data: computed as Prisma.InputJsonValue,
            ...totals,
          },
          update: { employeeName, uploadId: upload.id, data: computed as Prisma.InputJsonValue, ...totals },
        });
      })
    );
    imported = validRows.length;
  }

  const finalUpload = await prisma.wageUpload.update({
    where: { id: upload.id },
    data: {
      status: errors.length && !imported ? 'FAILED' : 'COMPLETED',
      importedRows: imported,
      failedRows: errors.length,
      errorReport: errors.length ? (errors as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'WAGES',
    projectId: template.projectId,
    status: errors.length && !imported ? 'FAILURE' : 'SUCCESS',
    meta,
    details: { templateCode: code, uploadId: upload.id, month: input.month, year: input.year, imported, failed: errors.length, fileName: input.fileName },
  });

  return { upload: finalUpload, imported, failed: errors.length, total: input.rows.length, errors };
}
