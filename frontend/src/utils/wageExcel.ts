/// `exceljs` (~945KB) must never be a static import here — this file is
/// itself statically imported by ProjectWagesPage, so a top-level
/// `import ExcelJS from 'exceljs'` would pull the whole library into the
/// main bundle on every page load. Each function below dynamically
/// imports it instead, matching the rest of the app's Excel handling
/// (excelImport.ts, CommunicationHistory.tsx).
import type ExcelJS from 'exceljs';
import { WageColumnDef, WageEntry, WageImportRowInput } from '../api/modules';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function inputColumns(columns: WageColumnDef[]): WageColumnDef[] {
  return columns.filter((c) => !c.formula);
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

export async function downloadWageTemplate(templateName: string, columns: WageColumnDef[], month: number, year: number) {
  const ExcelJS = (await import('exceljs')).default;
  const cols = inputColumns(columns);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Wages');

  sheet.mergeCells(1, 1, 1, cols.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${templateName} — Wage Sheet — ${MONTHS[month - 1]} ${year}`;
  titleCell.font = { bold: true, size: 13 };

  const headerRow = sheet.getRow(2);
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.required ? `${c.label} *` : c.label;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    sheet.getColumn(i + 1).width = c.width ?? 14;
  });
  sheet.getRow(2).height = 32;
  headerRow.eachCell((cell) => {
    cell.alignment = { wrapText: true, vertical: 'middle' };
  });

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
  const headerLabels = cols.map((c, i) => {
    const raw = headerRow.getCell(i + 1).value;
    return String(raw ?? '')
      .replace(/\s*\*$/, '')
      .trim()
      .toLowerCase();
  });

  const requiredMissing = cols.filter((c, i) => c.required && headerLabels[i] !== c.label.trim().toLowerCase());
  if (requiredMissing.length) {
    return {
      headerValid: false,
      headerError: `Incorrect template — expected column "${requiredMissing[0].label}" was not found in the expected position. Please use the latest downloaded template.`,
      rows: [],
    };
  }

  const rows: WageImportRowInput[] = [];
  for (let r = headerRowIndex + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0) continue;
    const values: Record<string, string | number | null> = {};
    let hasAnyValue = false;
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      let v: string | number | null = null;
      if (cell.value !== null && cell.value !== undefined) {
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

  const headerRow = sheet.getRow(2);
  headerRow.getCell(1).value = 'Sr. No.';
  columns.forEach((c, i) => {
    headerRow.getCell(i + 2).value = c.label;
  });
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });
  sheet.getColumn(1).width = 8;
  columns.forEach((c, i) => {
    sheet.getColumn(i + 2).width = c.width ?? 14;
  });

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
