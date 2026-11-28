/// `exceljs` is never statically imported here — dynamically imported so
/// it only loads when actually used (see purchaseOrderExcel.ts for the
/// pattern explained in full).
import type ExcelJS from 'exceljs';
import { GoodsReceivedNote } from '../api/modules';
import { unitLabel } from './inventoryExcel';

function fmtDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB');
}

function num(v: string | number): number {
  return Number(v);
}

/// Reproduces GRN.xlsx's structure and wording (letterhead, supplier /
/// project / challan / LR reference block, item table with Qty as per
/// Challan / Actual Qty Received / Accepted Qty / Rejected Qty) populated
/// with this GRN's real data.
export async function exportGrnExcel(grn: GoodsReceivedNote) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('GRN');
  sheet.columns = [{ width: 6 }, { width: 10 }, { width: 30 }, { width: 10 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 30 }];

  sheet.getCell('A1').value = 'Forays Innovations Pvt Ltd.';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.mergeCells('A2:I2');
  sheet.getCell('A2').value = 'GOODS RECEIVED NOTE';
  sheet.getCell('A2').font = { bold: true, size: 13 };

  sheet.getCell('A4').value = `Supplier Name: ${grn.supplierName ?? ''}`;
  sheet.getCell('A5').value = `Project Name: ${grn.project?.projectName ?? ''}`;
  sheet.getCell('A6').value = `Project Number: ${grn.project?.projectNumber ?? ''}`;
  sheet.getCell('A7').value = `P.O. Number: ${grn.po?.poNumber ?? ''}`;

  sheet.getCell('F4').value = `GRN Number: ${grn.grnNumber}`;
  sheet.getCell('F5').value = `GRN Date: ${fmtDate(grn.grnDate)}`;
  sheet.getCell('F6').value = `Receipt Date: ${fmtDate(grn.receiptDate)}`;
  sheet.getCell('F7').value = `Transporter Name: ${grn.transporterName ?? ''}`;

  sheet.getCell('A9').value = `Challan Number: ${grn.challanNumber ?? ''}`;
  sheet.getCell('F9').value = `Challan Date: ${fmtDate(grn.challanDate)}`;
  sheet.getCell('A10').value = `LR Number: ${grn.lrNumber ?? ''}`;
  sheet.getCell('F10').value = `LR Date: ${fmtDate(grn.lrDate)}`;

  const headerRow = sheet.getRow(12);
  ['Sr.No.', 'Cost Code', 'Description', 'Unit', 'Qty as per Challan', 'Actual Qty Received', 'Accepted Qty', 'Rejected Qty', 'Remarks'].forEach(
    (h, i) => {
      headerRow.getCell(i + 1).value = h;
    }
  );
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });

  let row = 13;
  grn.items.forEach((item, idx) => {
    const r = sheet.getRow(row);
    r.getCell(1).value = idx + 1;
    r.getCell(2).value = item.costCode?.code ?? '';
    r.getCell(3).value = item.description;
    r.getCell(4).value = unitLabel(item.unit);
    r.getCell(5).value = num(item.qtyAsPerChallan);
    r.getCell(6).value = num(item.actualQtyReceived);
    r.getCell(7).value = num(item.acceptedQty);
    r.getCell(8).value = num(item.rejectedQty);
    r.getCell(9).value = item.remarks ?? '';
    row += 1;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${grn.grnNumber}_GRN.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
