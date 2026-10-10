/// `exceljs` is never statically imported here — dynamically imported so
/// it only loads when actually used (see grnExcel.ts for the pattern
/// explained in full).
import type ExcelJS from 'exceljs';
import { BillingItem, BILLING_STATUS_OPTIONS } from '../api/modules';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB');
}

function num(v: string | number): number {
  return Number(v);
}

function statusLabel(value: string): string {
  return BILLING_STATUS_OPTIONS.find((s) => s.value === value)?.label ?? value;
}

/// Exports the rows currently visible in the filtered Billing Status table.
/// When every row shares the same project + billing month/year (the common
/// case — the user filtered down to one period before exporting), the
/// header reproduces the paper form's "BILL DETAILS FOR THE MONTH OF ..."
/// title; otherwise a generic title is used since the export spans
/// multiple periods/projects.
export async function exportBillingStatusExcel(items: BillingItem[]) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Billing Status');
  sheet.columns = [{ width: 8 }, { width: 22 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 20 }];

  const projectIds = new Set(items.map((i) => i.billingRecord?.projectId));
  const monthYears = new Set(items.map((i) => `${i.billingRecord?.billingMonth}-${i.billingRecord?.billingYear}`));
  const single = items[0]?.billingRecord;

  sheet.mergeCells('A1:H1');
  if (single && projectIds.size === 1 && monthYears.size === 1) {
    sheet.getCell('A1').value = `BILL DETAILS FOR THE MONTH OF ${MONTH_NAMES[single.billingMonth - 1].toUpperCase()}-${single.billingYear}`;
  } else {
    sheet.getCell('A1').value = 'BILL DETAILS';
  }
  sheet.getCell('A1').font = { bold: true, size: 13 };

  let row = 2;
  if (single && projectIds.size === 1) {
    sheet.mergeCells(`A${row}:H${row}`);
    sheet.getCell(`A${row}`).value = `Project: ${single.project?.projectName ?? ''}${single.project?.projectNumber ? ` (${single.project.projectNumber})` : ''}`;
    row += 1;
  }
  if (single && (single.periodFrom || single.periodTo)) {
    sheet.mergeCells(`A${row}:H${row}`);
    sheet.getCell(`A${row}`).value = `Period: ${fmtDate(single.periodFrom)} to ${fmtDate(single.periodTo)}`;
    row += 1;
  }
  row += 1;

  const headerRow = sheet.getRow(row);
  ['SR. NO', 'PLANT', 'INVOICE NO', 'JMS NO', 'ABSTRACT AMOUNT', 'TAX AMOUNT', 'TOTAL AMOUNT', 'STATUS'].forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });
  row += 1;

  let totalAbstract = 0;
  let totalTax = 0;
  let totalAmount = 0;
  items.forEach((item, idx) => {
    const r = sheet.getRow(row);
    r.getCell(1).value = idx + 1;
    r.getCell(2).value = item.plantUnit;
    r.getCell(3).value = item.invoiceNo ?? '';
    r.getCell(4).value = item.jmsNo ?? '';
    r.getCell(5).value = num(item.abstractAmount);
    r.getCell(6).value = num(item.taxAmount);
    r.getCell(7).value = num(item.totalAmount);
    r.getCell(8).value = statusLabel(item.status);
    totalAbstract += num(item.abstractAmount);
    totalTax += num(item.taxAmount);
    totalAmount += num(item.totalAmount);
    row += 1;
  });

  const totalsRow = sheet.getRow(row);
  totalsRow.getCell(4).value = 'TOTAL';
  totalsRow.getCell(5).value = Math.round(totalAbstract * 100) / 100;
  totalsRow.getCell(6).value = Math.round(totalTax * 100) / 100;
  totalsRow.getCell(7).value = Math.round(totalAmount * 100) / 100;
  totalsRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Billing_Status_Export.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
