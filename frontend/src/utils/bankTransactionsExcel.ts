import type ExcelJS from 'exceljs';
import { BankTransaction } from '../api/modules';

function fmtDate(value?: string | null): string {
  return value ? new Date(value).toLocaleDateString('en-GB') : '';
}

/// Shared by the Receipts and Payments Excel downloads (req. 9A/9B) — same
/// column set either way, just a different title/filename.
export async function exportBankTransactionsExcel(rows: BankTransaction[], kind: 'Receipts' | 'Payments') {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(kind);
  sheet.columns = [{ width: 12 }, { width: 24 }, { width: 14 }, { width: 40 }, { width: 24 }, { width: 14 }, { width: 20 }];

  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = `Bank Accounts — ${kind}`;
  sheet.getCell('A1').font = { bold: true, size: 13 };

  const headerRow = sheet.getRow(3);
  ['Date', 'Bank Account', 'Project Number', `${kind === 'Receipts' ? 'Receipt' : 'Payment'} Description`, 'Remarks', 'Amount (₹)', 'Source Module'].forEach(
    (h, i) => {
      headerRow.getCell(i + 1).value = h;
    }
  );
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });

  let row = 4;
  let total = 0;
  rows.forEach((r) => {
    const sheetRow = sheet.getRow(row);
    sheetRow.getCell(1).value = fmtDate(r.transactionDate);
    sheetRow.getCell(2).value = r.bankAccount ? `${r.bankAccount.bankName} – ${r.bankAccount.accountType}` : '';
    sheetRow.getCell(3).value = r.project?.projectNumber ?? r.project?.projectName ?? '';
    sheetRow.getCell(4).value = r.description;
    sheetRow.getCell(5).value = r.remarks ?? '';
    sheetRow.getCell(6).value = r.effectiveAmount;
    sheetRow.getCell(7).value = r.sourceModule;
    total += r.effectiveAmount;
    row += 1;
  });

  const totalsRow = sheet.getRow(row);
  totalsRow.getCell(5).value = 'TOTAL';
  totalsRow.getCell(6).value = Math.round(total * 100) / 100;
  totalsRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bank_${kind}_Export.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
