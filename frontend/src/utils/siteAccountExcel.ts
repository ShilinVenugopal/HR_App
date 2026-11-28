/// `exceljs` is never statically imported here — dynamically imported so
/// it only loads when actually used (see grnExcel.ts for the pattern
/// explained in full).
import type ExcelJS from 'exceljs';
import { SiteAccountCostCode, SiteAccountStatement } from '../api/modules';
import { formatDatesText } from './siteAccountDates';

function fmtDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB');
}

function num(v: string | number): number {
  return Number(v);
}

const AMOUNT_FORMAT = '#,##0.00';

/// Reproduces "Forays Account Statement - Rev00.xlsx" (sheet "AS") as
/// closely as the underlying data allows: same header block, same
/// Vr.No/Item Code/Date/Particulars/Receipts/Deposits-Advances/Payments
/// columns, same F01-F24 row order and Subtotal placement (F01/F02/F03
/// only), and the same Total/Balance in Hand footer. `costCodes` is the
/// full static master (not just codes this statement happens to use) so
/// every row — funded or not — reproduces the paper template's structure.
/// Unlike that static template, a code here may have zero, one, or several
/// actual voucher rows, so rows are written with a running cursor rather
/// than to fixed cell coordinates.
export async function exportSiteAccountExcel(statement: SiteAccountStatement, costCodes: SiteAccountCostCode[]) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('AS');
  sheet.columns = [{ width: 10 }, { width: 10 }, { width: 20 }, { width: 34 }, { width: 14 }, { width: 16 }, { width: 14 }];

  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = 'Forays Innovations Pvt. Ltd.';
  sheet.getCell('A1').font = { bold: true, size: 12 };

  sheet.mergeCells('A2:D2');
  sheet.getCell('A2').value = `Name of the Job: ${statement.project?.projectName ?? ''}`;
  sheet.mergeCells('E2:G2');
  sheet.getCell('E2').value = `Date: ${fmtDate(statement.statementDate)}`;

  sheet.mergeCells('A3:D3');
  sheet.getCell('A3').value = `Account Statement Period From: ${fmtDate(statement.periodFrom)} to ${fmtDate(statement.periodTo)}`;
  sheet.mergeCells('E3:G3');
  sheet.getCell('E3').value = `Project No: ${statement.project?.projectNumber ?? ''}`;

  const headerRow = sheet.getRow(4);
  ['Vr. No', 'Item Code', 'Date', 'Particulars', 'Receipts (Amount)', 'Deposits/Advances', 'Payments'].forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });

  let row = 5;
  sheet.getCell(`D${row}`).value = 'Opening Balance';
  sheet.getCell(`E${row}`).value = num(statement.openingBalance);
  sheet.getCell(`E${row}`).numFmt = AMOUNT_FORMAT;
  row += 2;
  sheet.getCell(`D${row}`).value = 'Amount Received as site fund';
  sheet.getCell(`E${row}`).value = num(statement.siteFundReceived);
  sheet.getCell(`E${row}`).numFmt = AMOUNT_FORMAT;
  row += 1;

  const otherReceipts = statement.entries.filter((e) => e.entryType === 'OTHER_RECEIPT');
  for (const entry of otherReceipts) {
    row += 1;
    sheet.getCell(`A${row}`).value = entry.voucherNo ?? '';
    sheet.getCell(`C${row}`).value = formatDatesText(entry.dates);
    sheet.getCell(`D${row}`).value = entry.particulars ?? '';
    if (num(entry.receiptAmount) > 0) {
      sheet.getCell(`E${row}`).value = num(entry.receiptAmount);
      sheet.getCell(`E${row}`).numFmt = AMOUNT_FORMAT;
    }
    if (num(entry.depositAdvanceAmount) > 0) {
      sheet.getCell(`F${row}`).value = num(entry.depositAdvanceAmount);
      sheet.getCell(`F${row}`).numFmt = AMOUNT_FORMAT;
    }
  }

  row += 2;

  const expenseEntries = statement.entries.filter((e) => e.entryType === 'EXPENSE' && e.costCodeId);
  const entriesByCostCodeId = new Map<string, typeof expenseEntries>();
  for (const e of expenseEntries) {
    const list = entriesByCostCodeId.get(e.costCodeId!) ?? [];
    list.push(e);
    entriesByCostCodeId.set(e.costCodeId!, list);
  }

  const ordered = [...costCodes].sort((a, b) => a.displayOrder - b.displayOrder);
  const topLevelCodes = ordered.filter((c) => !c.parentCode);

  for (const top of topLevelCodes) {
    const children = ordered.filter((c) => c.parentCode === top.code);
    for (const cc of [top, ...children]) {
      const rows = entriesByCostCodeId.get(cc.id) ?? [];
      if (rows.length === 0) {
        sheet.getCell(`B${row}`).value = cc.code;
        sheet.getCell(`D${row}`).value = cc.description;
        row += 1;
        continue;
      }
      for (const entry of rows) {
        sheet.getCell(`A${row}`).value = entry.voucherNo ?? '';
        sheet.getCell(`B${row}`).value = cc.code;
        sheet.getCell(`C${row}`).value = formatDatesText(entry.dates);
        sheet.getCell(`D${row}`).value = cc.description;
        sheet.getCell(`G${row}`).value = num(entry.paymentAmount);
        sheet.getCell(`G${row}`).numFmt = AMOUNT_FORMAT;
        row += 1;
      }
    }
    if (top.hasSubtotal) {
      const groupIds = new Set([top.id, ...children.map((c) => c.id)]);
      const subtotal = expenseEntries
        .filter((e) => groupIds.has(e.costCodeId!))
        .reduce((sum, e) => sum + num(e.paymentAmount), 0);
      sheet.getCell(`D${row}`).value = 'Subtotal';
      sheet.getCell(`G${row}`).value = Math.round(subtotal * 100) / 100;
      sheet.getCell(`G${row}`).numFmt = AMOUNT_FORMAT;
      row += 1;
    }
  }

  row += 1;
  sheet.getCell(`D${row}`).value = 'Total';
  sheet.getCell(`E${row}`).value = statement.totals.totalReceipts;
  sheet.getCell(`E${row}`).numFmt = AMOUNT_FORMAT;
  sheet.getCell(`G${row}`).value = statement.totals.totalPayments;
  sheet.getCell(`G${row}`).numFmt = AMOUNT_FORMAT;
  sheet.getRow(row).font = { bold: true, size: 12 };

  row += 1;
  sheet.getCell(`D${row}`).value = 'Balance in Hand';
  sheet.getCell(`E${row}`).value = statement.totals.balanceInHand;
  sheet.getCell(`E${row}`).numFmt = AMOUNT_FORMAT;
  sheet.getRow(row).font = { bold: true, size: 12 };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Site_Account_Statement_${statement.project?.projectName ?? ''}_${statement.statementMonth}-${statement.statementYear}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
