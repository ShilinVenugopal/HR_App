/// `exceljs` is never statically imported here — dynamically imported so
/// it only loads when actually used (see wageExcel.ts / employeeExcel.ts
/// for the same pattern explained in full).
import type ExcelJS from 'exceljs';
import { PurchaseRequisition } from '../api/modules';
import { PR_CATEGORIES } from './purchaseRequisitionCategories';
import { unitLabel } from './inventoryExcel';

const COLUMN_WIDTHS = [8, 12, 30, 8, 12, 14, 14, 14, 12, 20];
const HEADERS = ['SR. NO', 'Cost Code', 'MATERIAL NAME', 'UNIT', 'TOTAL REQ. QTY', 'MAKE', 'MODEL NO.', 'QTY AVAILABLE AT SITE', 'BAL. QTY REQ.', 'REMARKS'];

function fmtDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB');
}

/// Reproduces PUR-01.xlsx's structure and exact wording (header block,
/// NAME OF SITE/PROJ NO./PURCHASE REQ. NO. fields, the 8 fixed A-H
/// category sections, and the 3-signature-block footer) populated with
/// this PR's real data — column geometry rather than pixel-identical
/// blank-template layout, since this exports actual submitted data, not a
/// fill-in-the-blank form.
export async function exportPurchaseRequisitionExcel(pr: PurchaseRequisition) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('PR');

  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  sheet.mergeCells('A1:C3');
  sheet.mergeCells('D1:H2');
  sheet.getCell('D1').value = 'FORAYS INNOVATIONS PVT LTD';
  sheet.getCell('D1').font = { bold: true, size: 14 };
  sheet.getCell('D1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.mergeCells('I1:J1');
  sheet.getCell('I1').value = 'Doc No.   : PUR-F-06';
  sheet.mergeCells('I2:J2');
  sheet.getCell('I2').value = 'Issue No. : 01  Rev : 00';
  sheet.mergeCells('D3:H3');
  sheet.getCell('D3').value = 'PURCHASE REQUISITION';
  sheet.getCell('D3').font = { bold: true, size: 12 };
  sheet.getCell('D3').alignment = { horizontal: 'center' };
  sheet.mergeCells('I3:J3');
  sheet.getCell('I3').value = `Date         : ${fmtDate(pr.createdAt)}`;

  sheet.mergeCells('A4:F4');
  sheet.getCell('A4').value = `NAME OF SITE :- ${pr.project?.projectName ?? ''}`;
  sheet.mergeCells('G4:J4');
  sheet.getCell('G4').value = `PROJ NO. :- ${pr.project?.projectNumber ?? ''}`;

  sheet.mergeCells('A5:F5');
  sheet.getCell('A5').value = `PURCHASE REQ. NO. :- ${pr.prNumber ?? ''}`;
  sheet.mergeCells('G5:J5');
  sheet.getCell('G5').value = `DATE :- ${fmtDate(pr.createdAt)}`;

  sheet.mergeCells('A6:F6');
  sheet.getCell('A6').value = `NAME OF SITE INCHARGE :- ${pr.siteInchargeName ?? ''}`;
  sheet.mergeCells('G6:J6');
  sheet.getCell('G6').value = `NAME OF STORE INCHARGE :- ${pr.storeInchargeName ?? ''}`;

  const headerRow = sheet.getRow(7);
  HEADERS.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
  });

  let row = 8;
  let srNo = 1;
  for (const cat of PR_CATEGORIES) {
    const items = pr.items.filter((it) => it.costCode?.code === cat.code);

    const catRow = sheet.getRow(row);
    catRow.getCell(1).value = cat.letter;
    catRow.getCell(2).value = cat.code;
    catRow.getCell(3).value = cat.label;
    catRow.font = { bold: true };
    catRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });
    row += 1;

    for (const item of items) {
      const r = sheet.getRow(row);
      r.getCell(1).value = srNo;
      r.getCell(2).value = item.costCode?.code ?? '';
      r.getCell(3).value = item.materialName;
      r.getCell(4).value = unitLabel(item.unit);
      r.getCell(5).value = Number(item.totalReqQty);
      r.getCell(6).value = item.make ?? '';
      r.getCell(7).value = item.modelNo ?? '';
      r.getCell(8).value = Number(item.qtyAvailableAtSite);
      r.getCell(9).value = Number(item.balQtyReq);
      r.getCell(10).value = item.remarks ?? '';
      srNo += 1;
      row += 1;
    }
  }

  row += 2;
  sheet.mergeCells(`A${row}:C${row}`);
  sheet.getCell(`A${row}`).value = 'REQUESTED BY (STORE INCHARGE)';
  sheet.mergeCells(`D${row}:F${row}`);
  sheet.getCell(`D${row}`).value = 'RECOMMENDED BY: (SITE INCHARGE)';
  sheet.mergeCells(`G${row}:J${row}`);
  sheet.getCell(`G${row}`).value = 'APPROVED BY: (GM / PM)';
  sheet.getRow(row).font = { bold: true };

  const nameRow = row + 1;
  sheet.mergeCells(`A${nameRow}:C${nameRow}`);
  sheet.getCell(`A${nameRow}`).value = `Name: ${pr.requester?.name ?? ''}`;
  sheet.mergeCells(`D${nameRow}:F${nameRow}`);
  sheet.getCell(`D${nameRow}`).value = `Name: ${pr.storeInchargeName ?? pr.siteInchargeName ?? ''}`;
  sheet.mergeCells(`G${nameRow}:J${nameRow}`);
  sheet.getCell(`G${nameRow}`).value = `Name: ${pr.currentApprover?.name ?? ''}`;

  const dateRow = row + 2;
  sheet.mergeCells(`A${dateRow}:C${dateRow}`);
  sheet.getCell(`A${dateRow}`).value = `Date: ${fmtDate(pr.createdAt)}`;
  sheet.mergeCells(`G${dateRow}:J${dateRow}`);
  sheet.getCell(`G${dateRow}`).value = `Date: ${pr.status === 'APPROVED' ? fmtDate(pr.decidedAt) : ''}`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${pr.requestNumber}_Purchase_Requisition.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
