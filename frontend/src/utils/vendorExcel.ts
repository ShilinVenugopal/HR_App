/// `exceljs` is dynamically imported so it only loads when actually used
/// (same pattern as costCodeExcel.ts / grnExcel.ts).
import type ExcelJS from 'exceljs';
import { Vendor } from '../api/modules';

/// Bank columns are included when present — for a caller without
/// PURCHASE_ORDER edit/Super Admin rights the API has already redacted
/// bankAccountNumber/bankIfscCode to null on every row, so those columns
/// come out blank for them automatically; no separate redaction needed
/// here.
export async function exportVendorsExcel(vendors: Vendor[]) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Vendors');

  sheet.columns = [
    { header: 'Vendor ID', key: 'id', width: 24 },
    { header: 'Vendor Name', key: 'name', width: 28 },
    { header: 'Address', key: 'address', width: 32 },
    { header: 'Product Name', key: 'productName', width: 20 },
    { header: 'Contact Number', key: 'phone', width: 16 },
    { header: 'Email ID', key: 'email', width: 24 },
    { header: 'GST Number', key: 'gstNumber', width: 18 },
    { header: 'Bank Account Number', key: 'bankAccountNumber', width: 20 },
    { header: 'Bank IFSC Code', key: 'bankIfscCode', width: 16 },
    { header: 'Created Date', key: 'createdAt', width: 14 },
    { header: 'Updated Date', key: 'updatedAt', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  vendors.forEach((v) => {
    sheet.addRow({
      id: v.id,
      name: v.name,
      address: v.address ?? '',
      productName: v.productName ?? '',
      phone: v.phone ?? '',
      email: v.email ?? '',
      gstNumber: v.gstNumber ?? '',
      bankAccountNumber: v.bankAccountNumber ?? '',
      bankIfscCode: v.bankIfscCode ?? '',
      createdAt: v.createdAt ? new Date(v.createdAt).toLocaleDateString() : '',
      updatedAt: v.updatedAt ? new Date(v.updatedAt).toLocaleDateString() : '',
      status: v.active ? 'ACTIVE' : 'INACTIVE',
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Vendors.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
