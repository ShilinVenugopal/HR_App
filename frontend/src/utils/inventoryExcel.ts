/// `exceljs` is never statically imported here — every function below
/// dynamically imports it so it only loads when actually used and never
/// bloats the main bundle (see wageExcel.ts / employeeExcel.ts for the
/// same pattern explained in full).
import type ExcelJS from 'exceljs';
import { APP_NAME } from '../config/branding';
import { InventoryItem } from '../api/modules';

export const INVENTORY_FIELDS = [
  { key: 'costCode', label: 'Cost Code' },
  { key: 'itemDescription', label: 'Item Description' },
  { key: 'unit', label: 'Unit' },
  { key: 'inStockQuantity', label: 'In-stock Quantity' },
  { key: 'consumedQuantity', label: 'Consumed Quantity' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'lastConsumptionUpdateAt', label: 'Last Date of Consumption Update' },
  { key: 'project', label: 'Project' },
] as const;

export type InventoryFieldKey = (typeof INVENTORY_FIELDS)[number]['key'];

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
/// shown everywhere else in the app) or just the bare code — either is
/// accepted so a manually-typed cell still resolves.
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

const SAMPLE_ROW: Record<InventoryFieldKey, string> = {
  costCode: 'F05A — Tools Tackles/Power Tools',
  itemDescription: 'Grinding Machine',
  unit: 'Nos',
  inStockQuantity: '10',
  consumedQuantity: '2',
  remarks: 'Sample row — delete before uploading',
  lastConsumptionUpdateAt: '2026-01-15',
  project: 'RIL Jamnagar',
};

export async function downloadInventoryTemplate(lookups: Lookups) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;

  const sheet = workbook.addWorksheet('Inventory');
  sheet.columns = INVENTORY_FIELDS.map((f) => ({ header: f.label, key: f.key, width: f.key === 'itemDescription' || f.key === 'remarks' ? 30 : 20 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sheet.addRow(SAMPLE_ROW);

  const dropdownFor = (key: InventoryFieldKey, values: string[]) => {
    const colNumber = INVENTORY_FIELDS.findIndex((f) => f.key === key) + 1;
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
    { field: 'Cost Code', mandatory: 'Yes', notes: `Must match an existing cost code: ${lookups.costCodes.map((c) => c.code).join(', ') || '(none configured)'}` },
    { field: 'Item Description', mandatory: 'Yes', notes: 'Required.' },
    { field: 'Unit', mandatory: 'Yes', notes: `One of: ${UNIT_OPTIONS.map((u) => u.label).join(', ')}` },
    { field: 'In-stock Quantity / Consumed Quantity', mandatory: 'No', notes: 'Numeric. Defaults to 0 if left blank. Consumed Quantity cannot exceed In-stock Quantity.' },
    { field: 'Last Date of Consumption Update', mandatory: 'No', notes: 'Format: YYYY-MM-DD. Left blank if there has been no consumption update.' },
    { field: 'Project', mandatory: 'Yes', notes: `Must match an existing project name exactly: ${lookups.projects.map((p) => p.name).join(', ') || '(none configured)'}` },
  ]);

  await downloadWorkbook(workbook, 'Inventory_Template.xlsx');
}

export interface RawInventoryRow {
  rowNumber: number;
  values: Record<InventoryFieldKey, string>;
}

export async function parseInventoryWorkbook(file: File): Promise<RawInventoryRow[]> {
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
  const columnIndexByKey = new Map<InventoryFieldKey, number>();
  headerRow.eachCell((cell, colNumber) => {
    const text = normalize(String(cell.value ?? ''));
    const match = INVENTORY_FIELDS.find((f) => normalize(f.label) === text);
    if (match) columnIndexByKey.set(match.key, colNumber);
  });

  const requiredHeaders: InventoryFieldKey[] = ['costCode', 'itemDescription', 'unit', 'project'];
  const missing = requiredHeaders.filter((k) => !columnIndexByKey.has(k));
  if (columnIndexByKey.size === 0) {
    throw new Error('The file headers do not match the Inventory Template. Please download the template and use it as-is.');
  }
  if (missing.length) {
    const labels = missing.map((k) => INVENTORY_FIELDS.find((f) => f.key === k)!.label).join(', ');
    throw new Error(`The file is missing required column(s): ${labels}. Please use the downloaded template.`);
  }

  const rows: RawInventoryRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0 || row.values == null) continue;

    const values = {} as Record<InventoryFieldKey, string>;
    let hasAnyValue = false;
    for (const field of INVENTORY_FIELDS) {
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
    throw new Error('No inventory rows were found below the header row.');
  }

  return rows;
}

export interface ValidatedInventoryRow {
  rowNumber: number;
  costCodeId: string | null;
  costCodeLabel: string;
  itemDescription: string;
  unit: string;
  inStockQuantity: number;
  consumedQuantity: number;
  remarks: string | null;
  lastConsumptionUpdateAt: string | null;
  projectId: string | null;
  projectLabel: string;
  errors: string[];
  isValid: boolean;
}

function parseNonNegativeNumber(value: string, label: string, errors: string[]): number {
  if (!value.trim()) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`${label} must be a non-negative number`);
    return 0;
  }
  return n;
}

/// Mirrors the server's validation rules (backend/src/modules/inventory/
/// inventory.validation.ts) so the import preview never shows a row as
/// valid that the backend would then reject.
export function validateInventoryRows(rawRows: RawInventoryRow[], lookups: Lookups): ValidatedInventoryRow[] {
  const seenKeys = new Set<string>();

  return rawRows.map((row) => {
    const errors: string[] = [];
    const v = row.values;

    let costCodeId: string | null = null;
    if (!v.costCode.trim()) {
      errors.push('Cost Code is required');
    } else {
      const found = findCostCode(lookups.costCodes, v.costCode);
      if (!found) errors.push(`Cost Code "${v.costCode}" was not found`);
      else costCodeId = found.id;
    }

    const itemDescription = v.itemDescription.trim();
    if (!itemDescription) errors.push('Item Description is required');

    let unit = '';
    if (!v.unit.trim()) {
      errors.push('Unit is required');
    } else {
      const match = UNIT_OPTIONS.find((u) => normalize(u.label) === normalize(v.unit) || u.value === normalize(v.unit));
      if (!match) errors.push(`Unit "${v.unit}" is not recognized`);
      else unit = match.value;
    }

    const inStockQuantity = parseNonNegativeNumber(v.inStockQuantity, 'In-stock Quantity', errors);
    const consumedQuantity = parseNonNegativeNumber(v.consumedQuantity, 'Consumed Quantity', errors);
    if (consumedQuantity > inStockQuantity) errors.push('Consumed Quantity cannot exceed In-stock Quantity');

    let lastConsumptionUpdateAt: string | null = null;
    if (v.lastConsumptionUpdateAt.trim()) {
      const parsed = new Date(v.lastConsumptionUpdateAt);
      if (Number.isNaN(parsed.getTime())) errors.push('Last Date of Consumption Update is not a valid date');
      else lastConsumptionUpdateAt = parsed.toISOString().slice(0, 10);
    }

    let projectId: string | null = null;
    if (!v.project.trim()) {
      errors.push('Project is required');
    } else {
      const found = findByName(lookups.projects, v.project);
      if (!found) errors.push(`Project "${v.project}" was not found or is not one of your assigned projects`);
      else projectId = found.id;
    }

    if (costCodeId && projectId && itemDescription) {
      const key = `${projectId}::${costCodeId}::${itemDescription}`;
      if (seenKeys.has(key)) errors.push('Duplicate row within this file (same Project + Cost Code + Item Description)');
      else seenKeys.add(key);
    }

    return {
      rowNumber: row.rowNumber,
      costCodeId,
      costCodeLabel: v.costCode,
      itemDescription,
      unit,
      inStockQuantity,
      consumedQuantity,
      remarks: v.remarks.trim() || null,
      lastConsumptionUpdateAt,
      projectId,
      projectLabel: v.project,
      errors,
      isValid: errors.length === 0,
    };
  });
}

export interface InventoryImportFailureRow {
  rowNumber: number;
  itemDescription: string;
  reason: string;
}

export async function downloadInventoryImportReport(failures: InventoryImportFailureRow[]) {
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

  await downloadWorkbook(workbook, 'Import_Report.xlsx');
}

/// Exports exactly the rows currently in the grid (already filtered by the
/// caller) to Excel.
export async function exportInventoryExcel(items: InventoryItem[]) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Inventory');

  sheet.columns = INVENTORY_FIELDS.map((f) => ({ header: f.label, key: f.key, width: f.key === 'itemDescription' || f.key === 'remarks' ? 30 : 20 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  items.forEach((item) => {
    sheet.addRow({
      costCode: item.costCode ? `${item.costCode.code} — ${item.costCode.name}` : '',
      itemDescription: item.itemDescription,
      unit: unitLabel(item.unit),
      inStockQuantity: Number(item.inStockQuantity),
      consumedQuantity: Number(item.consumedQuantity),
      remarks: item.remarks ?? '',
      lastConsumptionUpdateAt: item.lastConsumptionUpdateAt ? item.lastConsumptionUpdateAt.slice(0, 10) : '',
      project: item.project?.projectName ?? '',
    });
  });

  await downloadWorkbook(workbook, 'Inventory_Export.xlsx');
}

/// `jspdf`/`jspdf-autotable` (~650KB combined) must only ever be
/// dynamically imported, same rule as exceljs above.
export async function exportInventoryPdf(items: InventoryItem[]) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(12);
  doc.text('Inventory Report', 24, 24);

  autoTable(doc, {
    startY: 36,
    head: [['Sr. No.', 'Cost Code', 'Item Description', 'Unit', 'In-stock Qty', 'Consumed Qty', 'Date of Update', 'Balance Qty', 'Remarks', 'Project']],
    body: items.map((item, idx) => [
      idx + 1,
      item.costCode ? `${item.costCode.code} — ${item.costCode.name}` : '',
      item.itemDescription,
      unitLabel(item.unit),
      Number(item.inStockQuantity),
      Number(item.consumedQuantity),
      item.lastConsumptionUpdateAt ? item.lastConsumptionUpdateAt.slice(0, 10) : '',
      Number(item.inStockQuantity) - Number(item.consumedQuantity),
      item.remarks ?? '',
      item.project?.projectName ?? '',
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175] },
  });

  doc.save('Inventory_Report.pdf');
}
