/// `exceljs` is dynamically imported so it only loads when actually used
/// (same pattern as costCodeExcel.ts / vendorExcel.ts).
import type ExcelJS from 'exceljs';
import { ManpowerSummary, ManpowerSummaryEmployee } from '../api/modules';

export async function exportManpowerSummaryExcel(summary: ManpowerSummary, employees: ManpowerSummaryEmployee[], titleLabel: string) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();

  const unitSheet = workbook.addWorksheet('Unit Summary');
  unitSheet.mergeCells('A1:D1');
  unitSheet.getCell('A1').value = titleLabel;
  unitSheet.getCell('A1').font = { bold: true, size: 13 };

  unitSheet.getRow(3).values = ['Sl. No.', 'Unit', 'Total Manpower', 'Attendance Days'];
  unitSheet.getRow(3).font = { bold: true };
  unitSheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  unitSheet.columns = [{ width: 8 }, { width: 32 }, { width: 16 }, { width: 16 }];

  let row = 4;
  summary.units.forEach((u, idx) => {
    unitSheet.getRow(row).values = [idx + 1, u.unitName, u.manpower, u.attendanceDays];
    row += 1;
  });
  unitSheet.getRow(row).values = ['', 'Total', summary.totalUniqueManpower, summary.totalAttendanceDays];
  unitSheet.getRow(row).font = { bold: true };

  const employeeSheet = workbook.addWorksheet('Employee Details');
  employeeSheet.columns = [
    { header: 'Employee ID', key: 'employeeCode', width: 16 },
    { header: 'Employee Name', key: 'employeeName', width: 28 },
    { header: 'Unit', key: 'unitName', width: 28 },
    { header: 'Attendance Days', key: 'attendanceDays', width: 16 },
  ];
  employeeSheet.getRow(1).font = { bold: true };
  employeeSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  employees.forEach((e) => {
    employeeSheet.addRow({
      employeeCode: e.employeeCode,
      employeeName: e.employeeName,
      unitName: e.unitName,
      attendanceDays: e.attendanceDays,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Manpower_Summary_${summary.year}_${String(summary.month).padStart(2, '0')}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
