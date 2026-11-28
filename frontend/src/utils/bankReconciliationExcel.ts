import type ExcelJS from 'exceljs';
import { GeneratedReconciliationStatement } from '../api/modules';

function fmtDate(value?: string | null): string {
  return value ? new Date(value).toLocaleDateString('en-GB') : '';
}

/// Req. 9C: bank account details, period, the 4-line summary, the actual
/// bank statement balance/difference/status, and the complete receipt and
/// payment transaction lists for the period, all in one workbook.
export async function exportBankReconciliationExcel(
  statement: GeneratedReconciliationStatement,
  periodFrom: string,
  periodTo: string,
  bankStatementBalance?: number,
  bankStatementDate?: string
) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet('Reconciliation Summary');
  summarySheet.columns = [{ width: 32 }, { width: 24 }];

  summarySheet.getCell('A1').value = 'Bank Reconciliation Statement';
  summarySheet.getCell('A1').font = { bold: true, size: 13 };

  const accountLabel = statement.combined
    ? statement.accounts.map((a) => `${a.bankAccount.bankName} (${a.bankAccount.accountType})`).join(' + ')
    : `${statement.bankAccount.bankName} (${statement.bankAccount.accountType}) — ${statement.bankAccount.accountNumber}`;

  const rows: [string, string | number][] = [
    ['Bank Account', accountLabel],
    ['Period From', fmtDate(periodFrom)],
    ['Period To', fmtDate(periodTo)],
    ['Opening Balance', statement.openingBalance],
    ['Total Receipts', statement.totalReceipts],
    ['Total Payments', statement.totalPayments],
    ['Closing Book Balance', statement.closingBookBalance],
  ];
  if (bankStatementBalance != null) {
    rows.push(['Actual Bank Statement Balance', bankStatementBalance]);
    rows.push(['Bank Statement Date', fmtDate(bankStatementDate)]);
    const diff = Math.round((statement.closingBookBalance - bankStatementBalance) * 100) / 100;
    rows.push(['Reconciliation Difference', diff]);
    rows.push(['Reconciliation Status', Math.abs(diff) < 0.01 ? 'RECONCILED' : 'RECONCILIATION REQUIRED']);
  }

  rows.forEach(([label, value], i) => {
    const r = summarySheet.getRow(i + 3);
    r.getCell(1).value = label;
    r.getCell(1).font = { bold: true };
    r.getCell(2).value = value;
  });

  for (const kind of ['receipts', 'payments'] as const) {
    const sheet = workbook.addWorksheet(kind === 'receipts' ? 'Receipts' : 'Payments');
    sheet.columns = [{ width: 12 }, { width: 24 }, { width: 14 }, { width: 40 }, { width: 24 }, { width: 14 }, { width: 20 }];
    const header = sheet.getRow(1);
    ['Date', 'Project Number', 'Description', 'Remarks', 'Amount (₹)', 'Bank Account', 'Source Module'].forEach((h, i) => {
      header.getCell(i + 1).value = h;
    });
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    });
    statement[kind].forEach((t, idx) => {
      const r = sheet.getRow(idx + 2);
      r.getCell(1).value = fmtDate(t.transactionDate);
      r.getCell(2).value = t.project?.projectNumber ?? t.project?.projectName ?? '';
      r.getCell(3).value = t.description;
      r.getCell(4).value = t.remarks ?? '';
      r.getCell(5).value = t.effectiveAmount;
      r.getCell(6).value = t.bankAccount ? `${t.bankAccount.bankName} – ${t.bankAccount.accountType}` : '';
      r.getCell(7).value = t.sourceModule;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Bank_Reconciliation_Export.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
