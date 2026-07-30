/// `exceljs` is never statically imported here — dynamically imported so
/// it only loads when actually used (see wageExcel.ts for the pattern
/// explained in full).
import type ExcelJS from 'exceljs';
import { PurchaseOrder } from '../api/modules';
import { unitLabel } from './inventoryExcel';
import { amountToWords } from './numberToWords';
import { DEFAULT_PO_TERMS, resolveTermBody } from './purchaseOrderTerms';

function fmtDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB');
}

function num(v: string | number): number {
  return Number(v);
}

/// Reproduces PO_to_portal.xls's structure and exact wording (letterhead,
/// vendor/PO reference block, item table, totals + amount in words,
/// Terms 1-11, billing address/GST, and the "for Forays.../We accept"
/// signature footer) populated with this PO's real data.
export async function exportPurchaseOrderExcel(po: PurchaseOrder) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('PO');
  sheet.columns = [{ width: 6 }, { width: 10 }, { width: 30 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 14 }];

  sheet.getCell('A1').value = 'Forays Innovations Pvt Ltd.';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A2').value = 'Mankanthanam Building, Mukkoottuthara, Kanjirappally, Kottayam Dist., Kerala, India – 686 510';
  sheet.mergeCells('A3:E3');
  sheet.getCell('A3').value = 'PURCHASE ORDER';
  sheet.getCell('A3').font = { bold: true, size: 13 };

  sheet.getCell('A5').value = `Vendor: ${po.vendor?.name ?? ''}`;
  sheet.getCell('A6').value = `Address: ${po.vendor?.address ?? ''}`;
  sheet.getCell('A7').value = `Email: ${po.vendor?.email ?? ''}`;

  sheet.getCell('G5').value = `P.O. No.: ${po.poNumber}`;
  sheet.getCell('G6').value = `P.O. Date: ${fmtDate(po.poDate)}`;
  sheet.getCell('G7').value = `Enq. No. & Date: ${po.enquiryNoDate ?? ''}`;
  sheet.getCell('G8').value = `Quotation No.: ${po.quotationNo ?? ''}`;
  sheet.getCell('G9').value = `Ref: ${po.ref ?? ''}`;
  sheet.getCell('G10').value = `Job No. (Project No.): ${po.jobNo ?? po.project?.projectNumber ?? ''}`;

  sheet.getCell('A12').value = 'Dear Sir,';
  sheet.getCell('A13').value = 'Please supply the following items subject to conditions contained herein under:';

  const headerRow = sheet.getRow(15);
  ['Sr.No.', 'Cost Code', 'Description', 'Unit', 'Qty', 'Unit Rate (Rs)', 'Amount (Rs)', 'GST %', 'GST Amount (Rs)', 'Extended Price (Rs)'].forEach(
    (h, i) => {
      headerRow.getCell(i + 1).value = h;
    }
  );
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });

  let row = 16;
  po.items.forEach((item, idx) => {
    const r = sheet.getRow(row);
    r.getCell(1).value = idx + 1;
    r.getCell(2).value = item.costCode?.code ?? '';
    r.getCell(3).value = item.description;
    r.getCell(4).value = unitLabel(item.unit);
    r.getCell(5).value = num(item.qty);
    r.getCell(6).value = num(item.rate);
    r.getCell(7).value = num(item.amount);
    r.getCell(8).value = num(item.gstPercent);
    r.getCell(9).value = num(item.gstAmount);
    r.getCell(10).value = num(item.extendedPrice);
    row += 1;
  });

  row += 1;
  sheet.getCell(`I${row}`).value = 'Subtotal';
  sheet.getCell(`J${row}`).value = num(po.subtotal);
  row += 1;
  sheet.getCell(`I${row}`).value = 'Packing & Forwarding';
  sheet.getCell(`J${row}`).value = num(po.packingForwarding);
  row += 1;
  sheet.getCell(`I${row}`).value = 'Transportation Charges';
  sheet.getCell(`J${row}`).value = num(po.transportationCharges);
  row += 1;
  sheet.getCell(`I${row}`).value = 'Taxes & Duties';
  sheet.getCell(`J${row}`).value = num(po.taxesAndDuties);
  row += 1;
  sheet.getCell(`I${row}`).value = 'Total Price';
  sheet.getCell(`J${row}`).value = num(po.grandTotal);
  sheet.getRow(row).font = { bold: true };

  row += 2;
  sheet.mergeCells(`A${row}:J${row}`);
  sheet.getCell(`A${row}`).value = `Amount in Words: ${amountToWords(num(po.grandTotal))}`;
  sheet.getCell(`A${row}`).font = { italic: true };

  row += 2;
  sheet.mergeCells(`A${row}:J${row}`);
  sheet.getCell(`A${row}`).value = 'Billing Address & GST';
  sheet.getCell(`A${row}`).font = { bold: true };
  row += 1;
  sheet.mergeCells(`A${row}:J${row}`);
  sheet.getCell(`A${row}`).value =
    po.billingAddress ?? 'Forays Innovations Pvt. Ltd., Mankanthanam Building, Mukkoottuthara, Kanjirappally, Kottayam Dist., Kerala, India – 686 510';
  row += 1;
  sheet.mergeCells(`A${row}:J${row}`);
  sheet.getCell(`A${row}`).value = `GST No: ${po.billingGstNumber ?? '32AAGCF9837M1Z4'}`;

  row += 2;
  sheet.mergeCells(`A${row}:J${row}`);
  sheet.getCell(`A${row}`).value = 'Terms & Conditions';
  sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
  row += 1;

  for (const term of DEFAULT_PO_TERMS) {
    sheet.mergeCells(`A${row}:J${row}`);
    sheet.getCell(`A${row}`).value = term.heading;
    sheet.getCell(`A${row}`).font = { bold: true };
    row += 1;
    sheet.mergeCells(`A${row}:J${row}`);
    sheet.getCell(`A${row}`).value = resolveTermBody(term, po.termsAndConditions);
    sheet.getCell(`A${row}`).alignment = { wrapText: true };
    row += 1;
  }

  row += 2;
  sheet.getCell(`A${row}`).value = 'for Forays Innovations Pvt Ltd.';
  sheet.getCell(`G${row}`).value = 'We accept';
  row += 1;
  sheet.getCell(`G${row}`).value = `for ${po.vendor?.name ?? ''}`;
  row += 3;
  sheet.getCell(`A${row}`).value = 'Authorized Signatory';
  sheet.getCell(`A${row + 1}`).value = `Name: ${po.authorizedName ?? ''}`;
  sheet.getCell(`A${row + 2}`).value = `Designation: ${po.authorizedDesignation ?? ''}`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${po.poNumber}_Purchase_Order.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
