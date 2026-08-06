/// `exceljs` (~945KB) is never statically imported here — every function
/// below dynamically imports it so it only loads when actually used and
/// never bloats the main bundle, matching the rest of the app's Excel
/// handling (see wageExcel.ts for the same pattern explained in full).
import type ExcelJS from 'exceljs';
import { APP_NAME } from '../config/branding';
import { Employee } from '../api/modules';

/// Single source of truth for field labels — drives the downloadable
/// template's headers, the uploaded file's header mapping, the Export
/// Excel headers, and the Customize Columns checkbox list.
export const EMPLOYEE_FIELDS = [
  { key: 'employeeCode', label: 'Employee Code' },
  { key: 'name', label: 'Employee Name' },
  { key: 'fatherName', label: "Father's Name" },
  { key: 'contactNumber', label: 'Contact Number' },
  { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'joiningDate', label: 'Date of Joining' },
  { key: 'project', label: 'Project' },
  { key: 'designation', label: 'Designation' },
  { key: 'department', label: 'Department' },
  { key: 'panNumber', label: 'PAN Card Number' },
  { key: 'aadhaarNumber', label: 'Aadhaar Card Number' },
  { key: 'passportNumber', label: 'Passport Number' },
  { key: 'pfNumber', label: 'PF Number' },
  { key: 'uanNumber', label: 'UAN Number' },
  { key: 'esicNumber', label: 'ESIC Number' },
  { key: 'bankAccountNumber', label: 'Bank Account Number' },
  { key: 'bankIfscCode', label: 'Bank IFSC Code' },
  { key: 'bankName', label: 'Bank Name' },
  { key: 'bankAccountName', label: 'Bank Account Name' },
  { key: 'address', label: 'Address' },
  { key: 'status', label: 'Status' },
] as const;

export type EmployeeFieldKey = (typeof EMPLOYEE_FIELDS)[number]['key'];

export const DEFAULT_VISIBLE_COLUMNS: EmployeeFieldKey[] = ['employeeCode', 'name', 'contactNumber', 'project', 'department', 'designation', 'status'];

/// Fields stored as free-text in Excel to prevent Excel from silently
/// reinterpreting long numeric-looking IDs in scientific notation.
const TEXT_FORMATTED_FIELDS = new Set<EmployeeFieldKey>(['aadhaarNumber', 'panNumber', 'pfNumber', 'uanNumber', 'bankAccountNumber']);

export const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'RESIGNED', label: 'Resigned' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'ON_LEAVE', label: 'Leave' },
  { value: 'TERMINATED', label: 'Terminated' },
  { value: 'BLACKLISTED', label: 'Blacklisted' },
] as const;

export function statusLabel(value: string): string {
  return STATUS_OPTIONS.find((s) => s.value === value)?.label ?? value;
}

interface LookupOption {
  id: string;
  name: string;
}

interface Lookups {
  projects: LookupOption[];
  departments: LookupOption[];
  designations: LookupOption[];
}

function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function findByName(list: LookupOption[], name: string): LookupOption | undefined {
  const target = name.trim().toLowerCase();
  return list.find((o) => o.name.trim().toLowerCase() === target);
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const SAMPLE_ROW: Record<EmployeeFieldKey, string> = {
  employeeCode: 'EMP-1001',
  name: 'Ramesh Kumar',
  fatherName: 'Suresh Kumar',
  contactNumber: '9876543210',
  dateOfBirth: '1995-06-15',
  joiningDate: '2024-01-10',
  project: 'RIL Jamnagar',
  designation: 'Technician',
  department: 'Operations',
  panNumber: 'ABCDE1234F',
  aadhaarNumber: '123456789012',
  passportNumber: '',
  pfNumber: 'PF00123456',
  uanNumber: '100200300400',
  esicNumber: '',
  bankAccountNumber: '00011122233',
  bankIfscCode: 'SBIN0001234',
  bankName: 'State Bank of India',
  bankAccountName: 'Ramesh Kumar',
  address: '123, Sample Street, City',
  status: 'Active',
};

export async function downloadEmployeeTemplate(lookups: Lookups) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;

  const sheet = workbook.addWorksheet('Employees');
  sheet.columns = EMPLOYEE_FIELDS.map((f) => ({ header: f.label, key: f.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  TEXT_FORMATTED_FIELDS.forEach((key) => {
    sheet.getColumn(key).numFmt = '@';
  });
  sheet.addRow(SAMPLE_ROW);

  const dropdownFor = (key: EmployeeFieldKey, values: string[]) => {
    const colNumber = EMPLOYEE_FIELDS.findIndex((f) => f.key === key) + 1;
    const formula = `"${values.join(',')}"`;
    for (let row = 2; row <= 501; row += 1) {
      sheet.getCell(row, colNumber).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: 'Invalid value',
        error: `Please choose one of the values from the dropdown for this column.`,
      };
    }
  };
  if (lookups.projects.length) dropdownFor('project', lookups.projects.map((p) => p.name));
  if (lookups.departments.length) dropdownFor('department', lookups.departments.map((d) => d.name));
  if (lookups.designations.length) dropdownFor('designation', lookups.designations.map((d) => d.name));
  dropdownFor('status', STATUS_OPTIONS.map((s) => s.label));

  const guidance = workbook.addWorksheet('Guidance (read me)');
  guidance.columns = [
    { header: 'Field', key: 'field', width: 26 },
    { header: 'Mandatory', key: 'mandatory', width: 12 },
    { header: 'Accepted values / notes', key: 'notes', width: 60 },
  ];
  guidance.getRow(1).font = { bold: true };
  guidance.addRows([
    { field: 'Employee Code', mandatory: 'Yes', notes: 'Required. Must be unique.' },
    { field: 'Employee Name', mandatory: 'Yes', notes: 'Required.' },
    { field: 'Contact Number', mandatory: 'Yes', notes: 'Required. Exactly 10 digits.' },
    { field: 'Date of Birth / Date of Joining', mandatory: 'No', notes: 'Format: YYYY-MM-DD. Cannot be a future date.' },
    { field: 'Project', mandatory: 'Yes', notes: `Must match an existing project name exactly: ${lookups.projects.map((p) => p.name).join(', ') || '(none configured)'}` },
    { field: 'Designation / Department', mandatory: 'No', notes: 'Must match an existing name exactly if provided (see Settings).' },
    { field: 'PAN Card Number', mandatory: 'No', notes: 'Format: ABCDE1234F.' },
    { field: 'Aadhaar Card Number', mandatory: 'No', notes: 'Exactly 12 digits. Must be unique.' },
    { field: 'Bank IFSC Code', mandatory: 'No', notes: 'Standard 11-character IFSC format, e.g. SBIN0001234.' },
    { field: 'Bank Account Number', mandatory: 'No', notes: 'Digits only.' },
    { field: 'Status', mandatory: 'Yes', notes: `One of: ${STATUS_OPTIONS.map((s) => s.label).join(', ')}. Defaults to Active if left blank.` },
  ]);

  await downloadWorkbook(workbook, 'Employee_Template.xlsx');
}

export interface RawEmployeeRow {
  rowNumber: number;
  values: Record<EmployeeFieldKey, string>;
}

export async function parseEmployeeWorkbook(file: File): Promise<RawEmployeeRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error('This file could not be read. It may be corrupted or not a valid Excel file.');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 1) {
    throw new Error('The uploaded file is blank.');
  }

  const headerRow = sheet.getRow(1);
  const columnIndexByKey = new Map<EmployeeFieldKey, number>();
  headerRow.eachCell((cell, colNumber) => {
    const text = normalize(String(cell.value ?? ''));
    const match = EMPLOYEE_FIELDS.find((f) => normalize(f.label) === text);
    if (match) columnIndexByKey.set(match.key, colNumber);
  });

  const requiredHeaders: EmployeeFieldKey[] = ['employeeCode', 'name', 'contactNumber', 'project'];
  const missing = requiredHeaders.filter((k) => !columnIndexByKey.has(k));
  if (columnIndexByKey.size === 0) {
    throw new Error('The file headers do not match the Employee Template. Please download the template and use it as-is.');
  }
  if (missing.length) {
    const labels = missing.map((k) => EMPLOYEE_FIELDS.find((f) => f.key === k)!.label).join(', ');
    throw new Error(`The file is missing required column(s): ${labels}. Please use the downloaded template.`);
  }

  const rows: RawEmployeeRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0 || row.values == null) continue;

    const values = {} as Record<EmployeeFieldKey, string>;
    let hasAnyValue = false;
    for (const field of EMPLOYEE_FIELDS) {
      const idx = columnIndexByKey.get(field.key);
      const cell = idx ? row.getCell(idx) : undefined;
      let text = '';
      if (cell?.value != null) {
        if (cell.value instanceof Date) {
          text = cell.value.toISOString().slice(0, 10);
        } else if (typeof cell.value === 'object' && 'text' in (cell.value as object)) {
          text = String((cell.value as { text: unknown }).text ?? '');
        } else if (typeof cell.value === 'object' && 'result' in (cell.value as object)) {
          text = String((cell.value as { result: unknown }).result ?? '');
        } else {
          text = String(cell.value).trim();
        }
      }
      values[field.key] = text;
      if (text) hasAnyValue = true;
    }

    if (hasAnyValue) rows.push({ rowNumber, values });
  }

  if (!rows.length) {
    throw new Error('No employee rows were found below the header row.');
  }

  return rows;
}

export interface ValidatedEmployeeRow {
  rowNumber: number;
  raw: Record<EmployeeFieldKey, string>;
  employeeCode: string;
  name: string;
  fatherName: string | null;
  contactNumber: string;
  dateOfBirth: string | null;
  joiningDate: string | null;
  projectId: string | null;
  designationId: string | null;
  departmentId: string | null;
  panNumber: string | null;
  aadhaarNumber: string | null;
  passportNumber: string | null;
  pfNumber: string | null;
  uanNumber: string | null;
  esicNumber: string | null;
  bankAccountNumber: string | null;
  bankIfscCode: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  address: string | null;
  status: string;
  errors: string[];
  isValid: boolean;
}

const CONTACT_RE = /^\d{10}$/;
const AADHAAR_RE = /^\d{12}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const BANK_ACCOUNT_RE = /^\d+$/;

function parseDateNotFuture(value: string, label: string, errors: string[]): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    errors.push(`${label} is not a valid date`);
    return null;
  }
  if (parsed.getTime() > Date.now()) {
    errors.push(`${label} cannot be a future date`);
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

/// Mirrors the server's validation rules (backend/src/modules/employees/
/// employees.validation.ts) exactly, so the import preview never shows a
/// row as valid that the backend would then reject.
export function validateEmployeeRows(rawRows: RawEmployeeRow[], lookups: Lookups): ValidatedEmployeeRow[] {
  const seenCodes = new Set<string>();
  const seenAadhaars = new Set<string>();

  return rawRows.map((row) => {
    const errors: string[] = [];
    const v = row.values;

    const employeeCode = v.employeeCode.trim();
    if (!employeeCode) errors.push('Employee Code is required');
    else if (seenCodes.has(employeeCode)) errors.push('Duplicate Employee Code within this file');
    else seenCodes.add(employeeCode);

    const name = v.name.trim();
    if (!name) errors.push('Employee Name is required');

    const contactNumber = v.contactNumber.trim();
    if (!contactNumber) errors.push('Contact Number is required');
    else if (!CONTACT_RE.test(contactNumber)) errors.push('Contact Number must be exactly 10 digits');

    const dateOfBirth = parseDateNotFuture(v.dateOfBirth, 'Date of Birth', errors);
    const joiningDate = parseDateNotFuture(v.joiningDate, 'Date of Joining', errors);

    let projectId: string | null = null;
    if (!v.project.trim()) {
      errors.push('Project is required');
    } else {
      const found = findByName(lookups.projects, v.project);
      if (!found) errors.push(`Project "${v.project}" was not found or is not one of your assigned projects`);
      else projectId = found.id;
    }

    let designationId: string | null = null;
    if (v.designation) {
      const found = findByName(lookups.designations, v.designation);
      if (!found) errors.push(`Designation "${v.designation}" was not found`);
      else designationId = found.id;
    }

    let departmentId: string | null = null;
    if (v.department) {
      const found = findByName(lookups.departments, v.department);
      if (!found) errors.push(`Department "${v.department}" was not found`);
      else departmentId = found.id;
    }

    const panNumber = v.panNumber.trim() || null;
    if (panNumber && !PAN_RE.test(panNumber)) errors.push('PAN must be in the format ABCDE1234F');

    const aadhaarNumber = v.aadhaarNumber.trim() || null;
    if (aadhaarNumber) {
      if (!AADHAAR_RE.test(aadhaarNumber)) errors.push('Aadhaar must be exactly 12 digits');
      else if (seenAadhaars.has(aadhaarNumber)) errors.push('Duplicate Aadhaar Number within this file');
      else seenAadhaars.add(aadhaarNumber);
    }

    const bankAccountNumber = v.bankAccountNumber.trim() || null;
    if (bankAccountNumber && !BANK_ACCOUNT_RE.test(bankAccountNumber)) errors.push('Bank Account Number must contain digits only');

    const bankIfscCode = v.bankIfscCode.trim() || null;
    if (bankIfscCode && !IFSC_RE.test(bankIfscCode)) errors.push('Bank IFSC Code must be a valid 11-character code');

    let status = 'ACTIVE';
    if (v.status.trim()) {
      const match = STATUS_OPTIONS.find((s) => normalize(s.label) === normalize(v.status) || s.value === normalize(v.status));
      if (!match) errors.push(`Status "${v.status}" is not recognized`);
      else status = match.value;
    }

    return {
      rowNumber: row.rowNumber,
      raw: v,
      employeeCode,
      name,
      fatherName: v.fatherName.trim() || null,
      contactNumber,
      dateOfBirth,
      joiningDate,
      projectId,
      designationId,
      departmentId,
      panNumber: panNumber?.toUpperCase() ?? null,
      aadhaarNumber,
      passportNumber: v.passportNumber.trim() || null,
      pfNumber: v.pfNumber.trim() || null,
      uanNumber: v.uanNumber.trim() || null,
      esicNumber: v.esicNumber.trim() || null,
      bankAccountNumber,
      bankIfscCode: bankIfscCode?.toUpperCase() ?? null,
      bankName: v.bankName.trim() || null,
      bankAccountName: v.bankAccountName.trim() || null,
      address: v.address.trim() || null,
      status,
      errors,
      isValid: errors.length === 0,
    };
  });
}

export interface EmployeeImportFailureRow {
  rowNumber: number;
  employeeCode: string;
  name: string;
  reason: string;
}

export async function downloadEmployeeImportReport(failures: EmployeeImportFailureRow[]) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Failed Rows');
  sheet.columns = [
    { header: 'Row #', key: 'rowNumber', width: 10 },
    { header: 'Employee Code', key: 'employeeCode', width: 20 },
    { header: 'Employee Name', key: 'name', width: 26 },
    { header: 'Reason', key: 'reason', width: 60 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(failures);

  await downloadWorkbook(workbook, 'Import_Report.xlsx');
}

/// Exports exactly the rows and columns currently visible in the grid —
/// callers pass the already-filtered employee list and the user's current
/// column selection. Numeric-looking ID fields are written as text so
/// Excel never reinterprets them in scientific notation.
export async function exportEmployeesExcel(employees: Employee[], visibleKeys: EmployeeFieldKey[]) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Employees');

  const fields = EMPLOYEE_FIELDS.filter((f) => visibleKeys.includes(f.key));
  sheet.columns = fields.map((f) => ({ header: f.label, key: f.key, width: f.key === 'address' ? 30 : 20 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  fields.forEach((f) => {
    if (TEXT_FORMATTED_FIELDS.has(f.key)) sheet.getColumn(f.key).numFmt = '@';
    if (f.key === 'dateOfBirth' || f.key === 'joiningDate') sheet.getColumn(f.key).numFmt = 'yyyy-mm-dd';
  });

  const valueFor = (e: Employee, key: EmployeeFieldKey): string | number => {
    switch (key) {
      case 'project':
        return e.project?.projectName ?? '';
      case 'designation':
        return e.designation?.name ?? '';
      case 'department':
        return e.department?.name ?? '';
      case 'status':
        return statusLabel(e.status);
      case 'dateOfBirth':
        return e.dateOfBirth ? e.dateOfBirth.slice(0, 10) : '';
      case 'joiningDate':
        return e.joiningDate ? e.joiningDate.slice(0, 10) : '';
      default:
        return (e as unknown as Record<string, string | null>)[key] ?? '';
    }
  };

  employees.forEach((e) => {
    const rowData: Record<string, string | number> = {};
    fields.forEach((f) => {
      rowData[f.key] = valueFor(e, f.key);
    });
    sheet.addRow(rowData);
  });

  await downloadWorkbook(workbook, 'Employees_Export.xlsx');
}
