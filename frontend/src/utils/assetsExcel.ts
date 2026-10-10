/// `exceljs`/`jspdf` are dynamically imported here, same rule as
/// inventoryExcel.ts (see that file's header comment for the full reasoning).
import type ExcelJS from 'exceljs';
import { APP_NAME } from '../config/branding';
import { Asset } from '../api/modules';

/// Fields actually read back from an uploaded workbook. "Sr No" is
/// deliberately excluded — it's a template-only visual aid (see
/// ASSET_TEMPLATE_FIELDS below), never a real stored/imported value.
export const ASSET_FIELDS = [
  { key: 'costCode', label: 'Cost Code' },
  { key: 'itemDescription', label: 'Item Description' },
  { key: 'unit', label: 'Unit' },
  { key: 'workingQuantity', label: 'Working Quantity' },
  { key: 'nonWorkingQuantity', label: 'Non-working Quantity' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'date', label: 'Date' },
  { key: 'project', label: 'Project' },
] as const;

export type AssetFieldKey = (typeof ASSET_FIELDS)[number]['key'];

/// Template download only — adds a "Sr No" header column for the user's
/// own reference while filling out the sheet. Created By / Created Date
/// are intentionally never part of the template: both are generated
/// automatically from the logged-in user and the import timestamp.
const ASSET_TEMPLATE_FIELDS = [{ key: 'srNo', label: 'Sr No' }, ...ASSET_FIELDS] as const;

export const UNIT_OPTIONS = [
  { value: 'NOS', label: 'Nos' },
  { value: 'MTR', label: 'Mtr' },
  { value: 'LOT', label: 'Lot' },
  { value: 'EA', label: 'EA' },
  { value: 'KG', label: 'Kg' },
  { value: 'TON', label: 'Ton' },
  { value: 'LITER', label: 'Liter' },
  { value: 'PAIR', label: 'Pair' },
] as const;

export function unitLabel(value: string): string {
  return UNIT_OPTIONS.find((u) => u.value === value)?.label ?? value;
}

interface LookupOption {
  id: string;
  name: string;
}

interface CostCodeOption {
  id: string;
  code: string;
  name: string;
}

interface Lookups {
  projects: LookupOption[];
  costCodes: CostCodeOption[];
}

function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function findByName(list: LookupOption[], name: string): LookupOption | undefined {
  const target = name.trim().toLowerCase();
  return list.find((o) => o.name.trim().toLowerCase() === target);
}

/// Cost Code cells are entered as "CODE — Name" (matching the dropdown
/// shown everywhere else in the app) or just the bare code.
function findCostCode(list: CostCodeOption[], value: string): CostCodeOption | undefined {
  const raw = value.trim();
  const codeOnly = raw.split(/[—-]/)[0].trim().toLowerCase();
  return list.find((c) => c.code.toLowerCase() === codeOnly || c.code.toLowerCase() === raw.toLowerCase());
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const SAMPLE_ROW: Record<string, string> = {
  srNo: '1',
  costCode: 'F05A — Tools Tackles/Power Tools',
  itemDescription: 'Grinding Machine',
  unit: 'Nos',
  workingQuantity: '10',
  nonWorkingQuantity: '2',
  remarks: 'Sample row — delete before uploading',
  date: '2026-01-15',
  project: 'RIL Jamnagar',
};

export async function downloadAssetTemplate(lookups: Lookups) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;

  const sheet = workbook.addWorksheet('Assets');
  sheet.columns = ASSET_TEMPLATE_FIELDS.map((f) => ({
    header: f.label,
    key: f.key,
    width: f.key === 'itemDescription' || f.key === 'remarks' ? 30 : f.key === 'srNo' ? 8 : 20,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sheet.addRow(SAMPLE_ROW);

  const dropdownFor = (key: AssetFieldKey, values: string[]) => {
    const colNumber = ASSET_TEMPLATE_FIELDS.findIndex((f) => f.key === key) + 1;
    const formula = `"${values.join(',')}"`;
    for (let row = 2; row <= 501; row += 1) {
      sheet.getCell(row, colNumber).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: 'Invalid value',
        error: 'Please choose one of the values from the dropdown for this column.',
      };
    }
  };
  if (lookups.costCodes.length) dropdownFor('costCode', lookups.costCodes.map((c) => `${c.code} — ${c.name}`));
  dropdownFor('unit', UNIT_OPTIONS.map((u) => u.label));
  if (lookups.projects.length) dropdownFor('project', lookups.projects.map((p) => p.name));

  const guidance = workbook.addWorksheet('Guidance (read me)');
  guidance.columns = [
    { header: 'Field', key: 'field', width: 26 },
    { header: 'Mandatory', key: 'mandatory', width: 12 },
    { header: 'Accepted values / notes', key: 'notes', width: 60 },
  ];
  guidance.getRow(1).font = { bold: true };
  guidance.addRows([
    { field: 'Sr No', mandatory: 'No', notes: 'For your own reference only — not imported. The system numbers rows automatically.' },
    { field: 'Cost Code', mandatory: 'Yes', notes: `Must match an existing cost code: ${lookups.costCodes.map((c) => c.code).join(', ') || '(none configured)'}` },
    { field: 'Item Description', mandatory: 'Yes', notes: 'Required.' },
    { field: 'Unit', mandatory: 'Yes', notes: `One of: ${UNIT_OPTIONS.map((u) => u.label).join(', ')}. Free-text values are rejected.` },
    { field: 'Working Quantity', mandatory: 'Yes', notes: 'Numeric, 0 or greater.' },
    { field: 'Non-working Quantity', mandatory: 'Yes', notes: 'Numeric, 0 or greater.' },
    { field: 'Date', mandatory: 'Yes', notes: 'Format: YYYY-MM-DD.' },
    { field: 'Project', mandatory: 'Yes', notes: `Must match an existing project name exactly: ${lookups.projects.map((p) => p.name).join(', ') || '(none configured)'}` },
    { field: 'Created By / Created Date', mandatory: 'N/A', notes: 'Never entered manually — set automatically from the logged-in user and the import date/time.' },
  ]);

  await downloadWorkbook(workbook, 'Assets_Template.xlsx');
}

export interface RawAssetRow {
  rowNumber: number;
  values: Record<AssetFieldKey, string>;
}

export async function parseAssetWorkbook(file: File): Promise<RawAssetRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error('This file could not be read. It may be corrupted or not a valid Excel file.');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 1) {
    throw new Error('The uploaded file is blank.');
  }

  const headerRow = sheet.getRow(1);
  const columnIndexByKey = new Map<AssetFieldKey, number>();
  headerRow.eachCell((cell, colNumber) => {
    const text = normalize(String(cell.value ?? ''));
    const match = ASSET_FIELDS.find((f) => normalize(f.label) === text);
    if (match) columnIndexByKey.set(match.key, colNumber);
  });

  const requiredHeaders: AssetFieldKey[] = ['costCode', 'itemDescription', 'unit', 'workingQuantity', 'nonWorkingQuantity', 'date', 'project'];
  const missing = requiredHeaders.filter((k) => !columnIndexByKey.has(k));
  if (columnIndexByKey.size === 0) {
    throw new Error('The file headers do not match the Assets Template. Please download the template and use it as-is.');
  }
  if (missing.length) {
    const labels = missing.map((k) => ASSET_FIELDS.find((f) => f.key === k)!.label).join(', ');
    throw new Error(`The file is missing required column(s): ${labels}. Please use the downloaded template.`);
  }

  const rows: RawAssetRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0 || row.values == null) continue;

    const values = {} as Record<AssetFieldKey, string>;
    let hasAnyValue = false;
    for (const field of ASSET_FIELDS) {
      const idx = columnIndexByKey.get(field.key);
      const cell = idx ? row.getCell(idx) : undefined;
      let text = '';
      if (cell?.value != null) {
        if (cell.value instanceof Date) {
          text = cell.value.toISOString().slice(0, 10);
        } else if (typeof cell.value === 'object' && 'text' in (cell.value as object)) {
          text = String((cell.value as { text: unknown }).text ?? '');
        } else if (typeof cell.value === 'object' && 'result' in (cell.value as object)) {
          text = String((cell.value as { result: unknown }).result ?? '');
        } else {
          text = String(cell.value).trim();
        }
      }
      values[field.key] = text;
      if (text) hasAnyValue = true;
    }

    if (hasAnyValue) rows.push({ rowNumber, values });
  }

  if (!rows.length) {
    throw new Error('No asset rows were found below the header row.');
  }

  return rows;
}

export interface ValidatedAssetRow {
  rowNumber: number;
  costCodeId: string | null;
  costCodeLabel: string;
  itemDescription: string;
  unit: string;
  workingQuantity: number;
  nonWorkingQuantity: number;
  remarks: string | null;
  date: string | null;
  projectId: string | null;
  projectLabel: string;
  /// Row/Field/Error triples for the validation results table — kept
  /// alongside the flat `errors` list (which stays for backward-compatible
  /// summaries) so the UI can show "Row N — Field — Error" per spec.
  fieldErrors: { field: string; message: string }[];
  errors: string[];
  isValid: boolean;
}

function parseQuantity(value: string, label: string, fieldErrors: { field: string; message: string }[]): number {
  if (!value.trim()) {
    fieldErrors.push({ field: label, message: `${label} is required` });
    return 0;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    fieldErrors.push({ field: label, message: `Invalid quantity "${value}"` });
    return 0;
  }
  if (n < 0) {
    fieldErrors.push({ field: label, message: `${label} cannot be negative` });
    return 0;
  }
  return n;
}

/// Mirrors the server's validation rules (backend/src/modules/assets/
/// assets.validation.ts) so the import preview never shows a row as valid
/// that the backend would then reject.
export function validateAssetRows(rawRows: RawAssetRow[], lookups: Lookups): ValidatedAssetRow[] {
  return rawRows.map((row) => {
    const fieldErrors: { field: string; message: string }[] = [];
    const v = row.values;

    let costCodeId: string | null = null;
    if (!v.costCode.trim()) {
      fieldErrors.push({ field: 'Cost Code', message: 'Cost Code is required' });
    } else {
      const found = findCostCode(lookups.costCodes, v.costCode);
      if (!found) fieldErrors.push({ field: 'Cost Code', message: `Invalid cost code "${v.costCode}"` });
      else costCodeId = found.id;
    }

    const itemDescription = v.itemDescription.trim();
    if (!itemDescription) fieldErrors.push({ field: 'Item Description', message: 'Item Description is required' });

    let unit = '';
    if (!v.unit.trim()) {
      fieldErrors.push({ field: 'Unit', message: 'Unit is required' });
    } else {
      const match = UNIT_OPTIONS.find((u) => normalize(u.label) === normalize(v.unit) || u.value === normalize(v.unit));
      if (!match) fieldErrors.push({ field: 'Unit', message: `Invalid unit "${v.unit}"` });
      else unit = match.value;
    }

    const workingQuantity = parseQuantity(v.workingQuantity, 'Working Quantity', fieldErrors);
    const nonWorkingQuantity = parseQuantity(v.nonWorkingQuantity, 'Non-working Quantity', fieldErrors);

    let date: string | null = null;
    if (!v.date.trim()) {
      fieldErrors.push({ field: 'Date', message: 'Date is required' });
    } else {
      const parsed = new Date(v.date);
      if (Number.isNaN(parsed.getTime())) fieldErrors.push({ field: 'Date', message: `Invalid date "${v.date}"` });
      else date = parsed.toISOString().slice(0, 10);
    }

    let projectId: string | null = null;
    if (!v.project.trim()) {
      fieldErrors.push({ field: 'Project', message: 'Project is required' });
    } else {
      const found = findByName(lookups.projects, v.project);
      if (!found) fieldErrors.push({ field: 'Project', message: `Project not found "${v.project}"` });
      else projectId = found.id;
    }

    return {
      rowNumber: row.rowNumber,
      costCodeId,
      costCodeLabel: v.costCode,
      itemDescription,
      unit,
      workingQuantity,
      nonWorkingQuantity,
      remarks: v.remarks.trim() || null,
      date,
      projectId,
      projectLabel: v.project,
      fieldErrors,
      errors: fieldErrors.map((e) => `${e.field} — ${e.message}`),
      isValid: fieldErrors.length === 0,
    };
  });
}

export interface AssetImportFailureRow {
  rowNumber: number;
  itemDescription: string;
  reason: string;
}

export async function downloadAssetImportReport(failures: AssetImportFailureRow[]) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Failed Rows');
  sheet.columns = [
    { header: 'Row #', key: 'rowNumber', width: 10 },
    { header: 'Item Description', key: 'itemDescription', width: 30 },
    { header: 'Reason', key: 'reason', width: 60 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(failures);

  await downloadWorkbook(workbook, 'Assets_Import_Report.xlsx');
}

/// Exports exactly the rows currently in the grid (already filtered/sorted
/// by the caller) to Excel.
export async function exportAssetsExcel(items: Asset[]) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Assets');

  const columns = [{ key: 'srNo', label: 'Sr No' }, ...ASSET_FIELDS, { key: 'createdBy', label: 'Created By' }, { key: 'createdDate', label: 'Created Date' }];
  sheet.columns = columns.map((f) => ({ header: f.label, key: f.key, width: f.key === 'itemDescription' || f.key === 'remarks' ? 30 : 20 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  items.forEach((item, idx) => {
    sheet.addRow({
      srNo: idx + 1,
      costCode: item.costCode ? `${item.costCode.code} — ${item.costCode.name}` : '',
      itemDescription: item.itemDescription,
      unit: unitLabel(item.unit),
      workingQuantity: Number(item.workingQuantity),
      nonWorkingQuantity: Number(item.nonWorkingQuantity),
      remarks: item.remarks ?? '',
      date: item.date ? item.date.slice(0, 10) : '',
      project: item.project?.projectName ?? '',
      createdBy: item.createdBy?.name ?? '',
      createdDate: item.createdAt ? item.createdAt.slice(0, 10) : '',
    });
  });

  await downloadWorkbook(workbook, 'Assets_Export.xlsx');
}

/// `jspdf`/`jspdf-autotable` must only ever be dynamically imported, same
/// rule as exceljs above.
export async function exportAssetsPdf(items: Asset[]) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(12);
  doc.text('Assets Report', 24, 24);

  autoTable(doc, {
    startY: 36,
    head: [['Sr No', 'Cost Code', 'Item Description', 'Unit', 'Working Qty', 'Non-working Qty', 'Remarks', 'Date', 'Project', 'Created By', 'Created Date']],
    body: items.map((item, idx) => [
      idx + 1,
      item.costCode ? `${item.costCode.code} — ${item.costCode.name}` : '',
      item.itemDescription,
      unitLabel(item.unit),
      Number(item.workingQuantity),
      Number(item.nonWorkingQuantity),
      item.remarks ?? '',
      item.date ? item.date.slice(0, 10) : '',
      item.project?.projectName ?? '',
      item.createdBy?.name ?? '',
      item.createdAt ? item.createdAt.slice(0, 10) : '',
    ]),
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175] },
  });

  doc.save('Assets_Report.pdf');
}
