/// `exceljs` and `jspdf` are never statically imported here — every
/// function below dynamically imports them so they only load when actually
/// used and never bloat the main bundle, matching the rest of the app's
/// Excel/PDF handling (see employeeExcel.ts / wageExcel.ts).
import type ExcelJS from 'exceljs';
import { Asset, AssetUnit } from '../api/modules';

export const ASSET_UNITS: { value: AssetUnit; label: string }[] = [
  { value: 'NOS', label: 'Nos' },
  { value: 'MTR', label: 'Mtr' },
  { value: 'LOT', label: 'Lot' },
  { value: 'EA', label: 'EA' },
  { value: 'KG', label: 'Kg' },
  { value: 'TON', label: 'Ton' },
  { value: 'LITER', label: 'Liter' },
  { value: 'PAIR', label: 'Pair' },
];

export function unitLabel(value: string): string {
  return ASSET_UNITS.find((u) => u.value === value)?.label ?? value;
}

/// Single source of truth for field labels — drives the downloadable
/// template's headers and the uploaded file's header mapping. "Sr No" is
/// included as a column for the user's reference/row-ordering only — it is
/// server-generated and never read from the uploaded file.
export const ASSET_COLUMNS = [
  { key: 'srNo', header: 'Sr No' },
  { key: 'costCode', header: 'Cost Code' },
  { key: 'itemDescription', header: 'Item Description' },
  { key: 'unit', header: 'Unit' },
  { key: 'workingQuantity', header: 'Working Quantity' },
  { key: 'nonWorkingQuantity', header: 'Non-working Quantity' },
  { key: 'remarks', header: 'Remarks' },
  { key: 'date', header: 'Date' },
  { key: 'project', header: 'Project' },
] as const;

export type AssetColumnKey = (typeof ASSET_COLUMNS)[number]['key'];

const REQUIRED_HEADERS: AssetColumnKey[] = ['costCode', 'itemDescription', 'unit', 'workingQuantity', 'nonWorkingQuantity', 'date', 'project'];

function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
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

const SAMPLE_ROW: Record<AssetColumnKey, string> = {
  srNo: '',
  costCode: 'CC-1001',
  itemDescription: 'Control Cable',
  unit: 'Mtr',
  workingQuantity: '120',
  nonWorkingQuantity: '5',
  remarks: 'Sample row — delete before importing',
  date: '2026-01-15',
  project: 'RIL Jamnagar',
};

export async function downloadAssetTemplate(projectNames: string[]) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Forays Group HR Solutions';

  const sheet = workbook.addWorksheet('Assets');
  sheet.columns = ASSET_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.key === 'itemDescription' || c.key === 'remarks' ? 30 : 20 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sheet.addRow(SAMPLE_ROW);

  const dropdownFor = (key: AssetColumnKey, values: string[]) => {
    const colNumber = ASSET_COLUMNS.findIndex((c) => c.key === key) + 1;
    const formula = `"${values.join(',')}"`;
    for (let row = 2; row <= 1001; row += 1) {
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
  dropdownFor('unit', ASSET_UNITS.map((u) => u.label));
  if (projectNames.length) dropdownFor('project', projectNames);

  const guidance = workbook.addWorksheet('Guidance (read me)');
  guidance.columns = [
    { header: 'Field', key: 'field', width: 26 },
    { header: 'Mandatory', key: 'mandatory', width: 12 },
    { header: 'Accepted values / notes', key: 'notes', width: 60 },
  ];
  guidance.getRow(1).font = { bold: true };
  guidance.addRows([
    { field: 'Sr No', mandatory: 'No', notes: 'Leave blank — generated automatically on import.' },
    { field: 'Cost Code', mandatory: 'Yes', notes: 'Required.' },
    { field: 'Item Description', mandatory: 'Yes', notes: 'Required.' },
    { field: 'Unit', mandatory: 'Yes', notes: `One of: ${ASSET_UNITS.map((u) => u.label).join(', ')}` },
    { field: 'Working Quantity', mandatory: 'Yes', notes: 'Numeric, zero or greater.' },
    { field: 'Non-working Quantity', mandatory: 'Yes', notes: 'Numeric, zero or greater.' },
    { field: 'Remarks', mandatory: 'No', notes: 'Free text.' },
    { field: 'Date', mandatory: 'Yes', notes: 'Format: YYYY-MM-DD.' },
    {
      field: 'Project',
      mandatory: 'Yes',
      notes: projectNames.length ? `Must match one of your assigned projects exactly: ${projectNames.join(', ')}` : 'Must match an existing project name exactly.',
    },
    { field: 'Created By / Created Date', mandatory: 'N/A', notes: 'Not entered here — set automatically from the logged-in user and upload time.' },
  ]);

  await downloadWorkbook(workbook, 'Asset_Template.xlsx');
}

export interface RawAssetRow {
  rowNumber: number;
  values: Record<AssetColumnKey, string>;
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
  const columnIndexByKey = new Map<AssetColumnKey, number>();
  headerRow.eachCell((cell, colNumber) => {
    const text = normalize(String(cell.value ?? ''));
    const match = ASSET_COLUMNS.find((c) => normalize(c.header) === text);
    if (match) columnIndexByKey.set(match.key, colNumber);
  });

  if (columnIndexByKey.size === 0) {
    throw new Error('The file headers do not match the Asset Template. Please download the template and use it as-is.');
  }
  const missing = REQUIRED_HEADERS.filter((k) => !columnIndexByKey.has(k));
  if (missing.length) {
    const labels = missing.map((k) => ASSET_COLUMNS.find((c) => c.key === k)!.header).join(', ');
    throw new Error(`The file is missing required column(s): ${labels}. Please use the downloaded template.`);
  }

  const rows: RawAssetRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0 || row.values == null) continue;

    const values = {} as Record<AssetColumnKey, string>;
    let hasAnyValue = false;
    for (const col of ASSET_COLUMNS) {
      const idx = columnIndexByKey.get(col.key);
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
      values[col.key] = text;
      if (col.key !== 'srNo' && text) hasAnyValue = true;
    }

    if (hasAnyValue) rows.push({ rowNumber, values });
  }

  if (!rows.length) {
    throw new Error('No asset rows were found below the header row.');
  }

  return rows;
}

export interface AssetRowFieldError {
  field: string;
  message: string;
}

export interface LookupOption {
  id: string;
  name: string;
}

export interface ValidatedAssetRow {
  rowNumber: number;
  raw: Record<AssetColumnKey, string>;
  costCode: string;
  itemDescription: string;
  unit: AssetUnit | '';
  workingQuantity: string;
  nonWorkingQuantity: string;
  remarks: string | null;
  date: string;
  projectId: string | null;
  projectName: string;
  errors: AssetRowFieldError[];
  isValid: boolean;
}

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

function findByName(list: LookupOption[], name: string): LookupOption | undefined {
  const target = name.trim().toLowerCase();
  return list.find((o) => o.name.trim().toLowerCase() === target);
}

/// Mirrors the server's validation rules (backend/src/modules/assets/
/// assets.validation.ts) exactly, so the import preview never shows a row
/// as valid that the backend would then reject.
export function validateAssetRows(rawRows: RawAssetRow[], lookups: { projects: LookupOption[] }): ValidatedAssetRow[] {
  return rawRows.map((row) => {
    const errors: AssetRowFieldError[] = [];
    const v = row.values;
    const push = (field: string, message: string) => errors.push({ field, message });

    const costCode = v.costCode.trim();
    if (!costCode) push('Cost Code', 'Cost Code is required');

    const itemDescription = v.itemDescription.trim();
    if (!itemDescription) push('Item Description', 'Item Description is required');

    let unit: AssetUnit | '' = '';
    const unitInput = v.unit.trim();
    if (!unitInput) {
      push('Unit', 'Unit is required');
    } else {
      const match = ASSET_UNITS.find((u) => normalize(u.label) === normalize(unitInput) || u.value === normalize(unitInput));
      if (!match) push('Unit', `Invalid unit "${unitInput}"`);
      else unit = match.value;
    }

    const workingQuantityRaw = v.workingQuantity.trim();
    if (!workingQuantityRaw) {
      push('Working Quantity', 'Working Quantity is required');
    } else if (!NUMERIC_RE.test(workingQuantityRaw)) {
      push('Working Quantity', `Invalid quantity "${workingQuantityRaw}"`);
    } else if (Number(workingQuantityRaw) < 0) {
      push('Working Quantity', 'Quantity cannot be negative');
    }

    const nonWorkingQuantityRaw = v.nonWorkingQuantity.trim();
    if (!nonWorkingQuantityRaw) {
      push('Non-working Quantity', 'Non-working Quantity is required');
    } else if (!NUMERIC_RE.test(nonWorkingQuantityRaw)) {
      push('Non-working Quantity', `Invalid quantity "${nonWorkingQuantityRaw}"`);
    } else if (Number(nonWorkingQuantityRaw) < 0) {
      push('Non-working Quantity', 'Quantity cannot be negative');
    }

    let date = '';
    const dateInput = v.date.trim();
    if (!dateInput) {
      push('Date', 'Date is required');
    } else {
      const parsed = new Date(dateInput);
      if (Number.isNaN(parsed.getTime())) push('Date', `Invalid date "${dateInput}"`);
      else date = parsed.toISOString().slice(0, 10);
    }

    let projectId: string | null = null;
    const projectInput = v.project.trim();
    if (!projectInput) {
      push('Project', 'Project is required');
    } else {
      const found = findByName(lookups.projects, projectInput);
      if (!found) push('Project', 'Project not found');
      else projectId = found.id;
    }

    return {
      rowNumber: row.rowNumber,
      raw: v,
      costCode,
      itemDescription,
      unit,
      workingQuantity: workingQuantityRaw,
      nonWorkingQuantity: nonWorkingQuantityRaw,
      remarks: v.remarks.trim() || null,
      date,
      projectId,
      projectName: projectInput,
      errors,
      isValid: errors.length === 0,
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

  await downloadWorkbook(workbook, 'Import_Report.xlsx');
}

/// Exports exactly the rows passed in — callers pass the already
/// search/filtered/sorted asset list so the export matches what's on screen.
export async function exportAssetsExcel(assets: Asset[]) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Assets');

  sheet.columns = [
    { header: 'Sr No', key: 'srNo', width: 10 },
    { header: 'Cost Code', key: 'costCode', width: 18 },
    { header: 'Item Description', key: 'itemDescription', width: 32 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Working Quantity', key: 'workingQuantity', width: 16 },
    { header: 'Non-working Quantity', key: 'nonWorkingQuantity', width: 18 },
    { header: 'Remarks', key: 'remarks', width: 26 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Project', key: 'project', width: 22 },
    { header: 'Created By', key: 'createdBy', width: 20 },
    { header: 'Created Date', key: 'createdDate', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  assets.forEach((a) => {
    sheet.addRow({
      srNo: a.srNo,
      costCode: a.costCode,
      itemDescription: a.itemDescription,
      unit: unitLabel(a.unit),
      workingQuantity: a.workingQuantity,
      nonWorkingQuantity: a.nonWorkingQuantity,
      remarks: a.remarks ?? '',
      date: a.date.slice(0, 10),
      project: a.project?.projectName ?? '',
      createdBy: a.createdBy?.name ?? '',
      createdDate: new Date(a.createdAt).toLocaleString(),
    });
  });

  await downloadWorkbook(workbook, 'Assets_Export.xlsx');
}

export async function exportAssetsPdf(assets: Asset[]) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  doc.setFontSize(12);
  doc.text('Assets', 24, 24);

  autoTable(doc, {
    startY: 36,
    head: [['Sr No', 'Cost Code', 'Item Description', 'Unit', 'Working Qty', 'Non-working Qty', 'Remarks', 'Date', 'Project', 'Created By', 'Created Date']],
    body: assets.map((a) => [
      a.srNo,
      a.costCode,
      a.itemDescription,
      unitLabel(a.unit),
      String(a.workingQuantity),
      String(a.nonWorkingQuantity),
      a.remarks ?? '',
      a.date.slice(0, 10),
      a.project?.projectName ?? '',
      a.createdBy?.name ?? '',
      new Date(a.createdAt).toLocaleDateString(),
    ]),
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175] },
  });

  doc.save('Assets_Export.pdf');
}
