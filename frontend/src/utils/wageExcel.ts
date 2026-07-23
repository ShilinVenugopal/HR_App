/// `exceljs` (~945KB) must never be a static import here — this file is
/// itself statically imported by ProjectWagesPage, so a top-level
/// `import ExcelJS from 'exceljs'` would pull the whole library into the
/// main bundle on every page load. Each function below dynamically
/// imports it instead, matching the rest of the app's Excel handling
/// (excelImport.ts, CommunicationHistory.tsx).
import type ExcelJS from 'exceljs';
import { WageColumnDef, WageEntry, WageFormulaSpec, WageImportRowInput } from '../api/modules';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TEMPLATE_DATA_ROWS = 500;

export function inputColumns(columns: WageColumnDef[]): WageColumnDef[] {
  return columns.filter((c) => !c.formula);
}

function normalize(value: string): string {
  return value
    .replace(/\s*\*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function downloadBlob(buffer: ExcelJS.Buffer, filename: string, mime: string) {
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/// Converts a 1-indexed column number to its Excel letter (1 -> 'A', 27 -> 'AA').
function columnLetter(n: number): string {
  let s = '';
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

/// Translates a WageFormulaSpec (formulaEngine.ts's server-side vocabulary)
/// into a native Excel formula string, so the downloadable template shows
/// a live-computed preview in Excel exactly like the source payroll sheet
/// does — purely a convenience for whoever fills the template in; the
/// backend always recomputes every formula column from raw inputs on
/// import/edit and never trusts these cells' values.
function excelFormula(spec: WageFormulaSpec, row: number, colOf: (key: string) => string): string {
  const ref = (key: string) => `${colOf(key)}${row}`;
  switch (spec.op) {
    case 'PRORATE':
      return `=IF(${ref(spec.workingDays)}=0,0,${ref(spec.base)}/${ref(spec.workingDays)}*${ref(spec.daysPaid)})`;
    case 'MULTIPLY':
      return `=${ref(spec.a)}*${ref(spec.b)}`;
    case 'PERCENT':
      return `=${ref(spec.field)}*${spec.percent}%`;
    case 'SUM':
      return `=SUM(${spec.fields.map(ref).join(',')})`;
    case 'CAP_SUM':
      return `=MIN(SUM(${spec.fields.map(ref).join(',')}),${spec.max})`;
    case 'SLAB2':
      return `=IF(${ref(spec.field)}<=${spec.threshold},0,${spec.amountAbove})`;
    case 'SUBTRACT':
      return `=${ref(spec.from)}-SUM(${spec.fields.map(ref).join(',')})`;
    default:
      return '=0';
  }
}

/// Shared layout for both the blank download template and the populated
/// export: column 1 is "Sr. No.", every WageColumnDef follows in template
/// order from column 2 — matching the source payroll sheet's own layout,
/// and keeping the two Excel outputs visually identical to each other.
function writeHeaderRow(sheet: ExcelJS.Worksheet, columns: WageColumnDef[], markRequired: boolean) {
  const headerRow = sheet.getRow(2);
  headerRow.getCell(1).value = 'Sr. No.';
  columns.forEach((c, i) => {
    headerRow.getCell(i + 2).value = markRequired && c.required ? `${c.label} *` : c.label;
  });
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
  });
  headerRow.height = 32;
  sheet.getColumn(1).width = 8;
  columns.forEach((c, i) => {
    sheet.getColumn(i + 2).width = c.width ?? 14;
  });
  columns.forEach((c, i) => {
    if (c.isTextFormat) sheet.getColumn(i + 2).numFmt = '@';
  });
}

export async function downloadWageTemplate(templateName: string, columns: WageColumnDef[], month: number, year: number) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Wages');

  sheet.mergeCells(1, 1, 1, columns.length + 1);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${templateName} — Wage Sheet — ${MONTHS[month - 1]} ${year}`;
  titleCell.font = { bold: true, size: 13 };

  writeHeaderRow(sheet, columns, true);

  const colOf = (key: string) => {
    const idx = columns.findIndex((c) => c.key === key);
    return columnLetter(idx + 2);
  };

  // Sr. No. + a live-formula preview for every computed column, so a user
  // filling this in Excel sees exactly the same running calculation the
  // original payroll sheet shows — matching "same calculation columns"
  // from the source format, even though the server always recomputes
  // these from raw inputs on import and never trusts what's typed here.
  for (let r = 3; r <= TEMPLATE_DATA_ROWS + 2; r += 1) {
    sheet.getCell(r, 1).value = r - 2;
    columns.forEach((c, i) => {
      if (c.formula) sheet.getCell(r, i + 2).value = { formula: excelFormula(c.formula, r, colOf) } as ExcelJS.CellFormulaValue;
    });
  }

  const guidance = workbook.addWorksheet('Guidance (read me)');
  guidance.columns = [
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Notes', key: 'notes', width: 70 },
  ];
  guidance.getRow(1).font = { bold: true };
  guidance.addRows([
    ...inputColumns(columns).map((c) => ({ field: c.label, notes: c.required ? 'Required.' : 'Optional.' })),
    { field: '(shaded / grey) computed columns', notes: 'Auto-calculated — left as live formulas here for your reference, but always recalculated by the system on import. You do not need to fill these in.' },
  ]);

  await downloadBlob(
    await workbook.xlsx.writeBuffer(),
    `${templateName.replace(/\s+/g, '_')}_Template_${MONTHS[month - 1]}_${year}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

export interface ParsedWageFile {
  headerValid: boolean;
  headerError?: string;
  rows: WageImportRowInput[];
}

/// Client-side parse + a first pass of header validation for immediate
/// feedback. The backend re-validates every row independently — this is
/// UX only, never the source of truth.
///
/// Headers are matched by LABEL TEXT, searched across the whole header
/// row — not by fixed column position. A positional check would silently
/// misread (or reject) any real-world payroll file whose column order
/// doesn't happen to match this template's generated order exactly, which
/// is exactly the compatibility bug this replaced.
export async function parseWageUploadFile(columns: WageColumnDef[], file: File): Promise<ParsedWageFile> {
  const ExcelJS = (await import('exceljs')).default;
  const cols = inputColumns(columns);
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headerValid: false, headerError: 'The uploaded file has no worksheet', rows: [] };

  const headerRowIndex = 2;
  const headerRow = sheet.getRow(headerRowIndex);
  const columnIndexByKey = new Map<string, number>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = normalize(String(cell.value ?? ''));
    const match = cols.find((c) => normalize(c.label) === text);
    if (match) columnIndexByKey.set(match.key, colNumber);
  });

  const requiredMissing = cols.filter((c) => c.required && !columnIndexByKey.has(c.key));
  if (columnIndexByKey.size === 0) {
    return {
      headerValid: false,
      headerError: 'The file headers do not match the wage template. Please download the latest template and use it as-is.',
      rows: [],
    };
  }
  if (requiredMissing.length) {
    return {
      headerValid: false,
      headerError: `Incorrect template — expected column "${requiredMissing[0].label}" was not found. Please use the latest downloaded template.`,
      rows: [],
    };
  }

  const rows: WageImportRowInput[] = [];
  for (let r = headerRowIndex + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0) continue;
    const values: Record<string, string | number | null> = {};
    let hasAnyValue = false;
    cols.forEach((c) => {
      const idx = columnIndexByKey.get(c.key);
      const cell = idx ? row.getCell(idx) : undefined;
      let v: string | number | null = null;
      if (cell?.value !== null && cell?.value !== undefined) {
        if (typeof cell.value === 'object' && 'result' in (cell.value as object)) {
          v = (cell.value as { result: unknown }).result as string | number | null;
        } else if (cell.value instanceof Date) {
          v = cell.value.toISOString().slice(0, 10);
        } else {
          v = cell.value as string | number;
        }
      }
      if (v !== null && v !== '') hasAnyValue = true;
      values[c.key] = v;
    });
    if (hasAnyValue) rows.push({ rowNumber: r, values });
  }

  return { headerValid: true, rows };
}

export interface WageRowValidationError {
  row: number;
  message: string;
}

/// Mirrors the server's row-level checks (backend/src/modules/projectWages/
/// projectWages.service.ts) so the upload preview can highlight problems
/// before anything is sent — the backend re-runs the same checks
/// authoritatively on import.
export function validateParsedRows(columns: WageColumnDef[], rows: WageImportRowInput[]): WageRowValidationError[] {
  const idCol = columns.find((c) => c.isEmployeeId);
  const nameCol = columns.find((c) => c.isEmployeeName);
  const errors: WageRowValidationError[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const employeeCode = idCol ? String(row.values[idCol.key] ?? '').trim() : '';
    const employeeName = nameCol ? String(row.values[nameCol.key] ?? '').trim() : '';
    const uan = row.values.uan !== undefined && row.values.uan !== null ? String(row.values.uan).trim() : '';

    if (!employeeCode) {
      errors.push({ row: row.rowNumber, message: 'Employee ID Missing' });
      continue;
    }
    if (!employeeName) {
      errors.push({ row: row.rowNumber, message: 'Employee Name Missing' });
      continue;
    }
    if (seen.has(employeeCode)) {
      errors.push({ row: row.rowNumber, message: 'Duplicate Employee' });
      continue;
    }
    if (uan && !/^\d{12}$/.test(uan)) {
      errors.push({ row: row.rowNumber, message: 'Invalid PF Number' });
      continue;
    }
    seen.add(employeeCode);
  }

  return errors;
}

export async function exportWagesExcel(templateName: string, columns: WageColumnDef[], entries: WageEntry[], month: number, year: number) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Wages');

  sheet.mergeCells(1, 1, 1, columns.length + 1);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${templateName} — Wage Sheet — ${MONTHS[month - 1]} ${year}`;
  titleCell.font = { bold: true, size: 13 };

  writeHeaderRow(sheet, columns, false);

  entries.forEach((entry, idx) => {
    const row = sheet.getRow(3 + idx);
    row.getCell(1).value = idx + 1;
    columns.forEach((c, i) => {
      row.getCell(i + 2).value = entry.data[c.key] ?? '';
    });
  });

  await downloadBlob(
    await workbook.xlsx.writeBuffer(),
    `${templateName.replace(/\s+/g, '_')}_Wages_${MONTHS[month - 1]}_${year}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

export async function exportWagesPdf(templateName: string, columns: WageColumnDef[], entries: WageEntry[], month: number, year: number) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  doc.setFontSize(12);
  doc.text(`${templateName} — Wage Sheet — ${MONTHS[month - 1]} ${year}`, 24, 24);

  autoTable(doc, {
    startY: 36,
    head: [['Sr. No.', ...columns.map((c) => c.label)]],
    body: entries.map((entry, idx) => [idx + 1, ...columns.map((c) => String(entry.data[c.key] ?? ''))]),
    styles: { fontSize: 6, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175] },
  });

  doc.save(`${templateName.replace(/\s+/g, '_')}_Wages_${MONTHS[month - 1]}_${year}.pdf`);
}

export { MONTHS };
