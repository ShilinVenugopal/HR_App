/// `exceljs` is never statically imported here — dynamically imported so
/// it only loads when actually used (see grnExcel.ts for the pattern
/// explained in full).
import type ExcelJS from 'exceljs';
import { CostCode } from '../api/modules';

/// Exports exactly Cost Code + Cost Code Description, per the design
/// brief — the richer supplementary fields (Items to Consider, Remarks,
/// Responsible Person) shown on the Cost Code Master page are deliberately
/// left out of this export.
export async function exportCostCodesExcel(costCodes: CostCode[]) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Cost Codes');

  sheet.columns = [
    { header: 'Cost Code', key: 'code', width: 14 },
    { header: 'Cost Code Description', key: 'description', width: 60 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  costCodes.forEach((c) => {
    sheet.addRow({ code: c.code, description: c.name });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Cost_Code_Master.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
