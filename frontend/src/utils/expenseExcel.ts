/// `exceljs` is dynamically imported so it only loads when actually used
/// (same pattern as costCodeExcel.ts / vendorExcel.ts).
import type ExcelJS from 'exceljs';
import { Expense } from '../api/modules';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/// Column headers reproduced from the reference "Expense adding.xlsx"
/// template (whitespace slips like the doubled space in "ESIC  (4.75 %)"
/// cleaned up; meaning unchanged) — column letters A-X below match that
/// template exactly, which is what lets the Total Amount formula reuse
/// its =SUM(G:W) reference untouched.
const HEADERS = [
  'Sr.No.',
  'Year',
  'Month',
  'UOM',
  'Manpower',
  'BASIC SALARY',
  'Total manpower Net Salary',
  'LEAVE PAY (5.77% @ Total)',
  'Bonus (8.33% @ Total)',
  'PF (12.5% of Total)',
  'ESIC (4.75 %)',
  'Transportation',
  'Accomodation',
  'Operational Cost',
  'Lab Lic., BG, GJ Lab. Fund',
  'PPE',
  'Coverall',
  'Medical Exp.',
  'Tools & Machinery',
  'Mob. & Demob. Cost',
  'Insurance (0.5%)',
  'Consumables',
  'Misc.',
  'Total Amount',
];

const num = (v: string | number) => Number(v) || 0;

export async function exportExpensesExcel(rows: Expense[], projectLabel: string, year: number, fromMonth: number, toMonth: number) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Expense');

  sheet.mergeCells('A1:X1');
  sheet.getCell('A1').value = `${projectLabel} — ${MONTHS[fromMonth - 1]} to ${MONTHS[toMonth - 1]} ${year}`;
  sheet.getCell('A1').font = { bold: true, size: 13 };

  const headerRow = sheet.getRow(3);
  headerRow.values = HEADERS;
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sheet.columns = HEADERS.map((h) => ({ width: h.length < 12 ? 12 : Math.min(h.length + 4, 30) }));

  rows.forEach((r, idx) => {
    const rowNum = 4 + idx;
    const row = sheet.getRow(rowNum);
    row.values = [
      idx + 1,
      r.year,
      MONTHS[r.month - 1],
      r.uom ?? '',
      num(r.manpower),
      num(r.basicSalary),
      num(r.totalManpowerNetSalary),
      num(r.leavePay),
      num(r.bonus),
      num(r.pf),
      num(r.esic),
      num(r.transportation),
      num(r.accommodation),
      num(r.operationalCost),
      num(r.labLicenseBgFund),
      num(r.ppe),
      num(r.coverall),
      num(r.medicalExpense),
      num(r.toolsAndMachinery),
      num(r.mobDemobCost),
      num(r.insurance),
      num(r.consumables),
      num(r.misc),
    ];
    // Total Amount is a real formula, not a pasted value — mirrors the
    // reference template's own =SUM(G:W) exactly.
    row.getCell('X').value = { formula: `SUM(G${rowNum}:W${rowNum})` };
    for (const col of ['F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X']) {
      row.getCell(col).numFmt = '#,##0.00';
    }
    row.getCell('E').numFmt = '#,##0';
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const projectSlug = projectLabel.replace(/[^a-zA-Z0-9]+/g, '_');
  a.download =
    fromMonth === toMonth
      ? `Expense_${projectSlug}_${MONTHS[fromMonth - 1]}_${year}.xlsx`
      : `Expense_${projectSlug}_${MONTHS[fromMonth - 1]}_to_${MONTHS[toMonth - 1]}_${year}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
