import ExcelJS from 'exceljs';
import { CANDIDATE_STATUSES, INTERVIEW_STAGES } from './candidateConstants';

/// Column order/labels here are the single source of truth for both the
/// downloadable template and the uploaded-file header mapping — keep them
/// in sync with the Recruitment "Add Candidate" form fields.
export const CANDIDATE_COLUMNS = [
  { key: 'candidateName', header: 'Candidate Name' },
  { key: 'contactNumber', header: 'Contact Number' },
  { key: 'dateOfBirth', header: 'Date of Birth' },
  { key: 'email', header: 'Email' },
  { key: 'qualification', header: 'Qualification' },
  { key: 'experience', header: 'Experience' },
  { key: 'designation', header: 'Designation' },
  { key: 'project', header: 'Assigned Project' },
  { key: 'foraysInterviewStatus', header: 'Forays Interview Status' },
  { key: 'clientInterviewStatus', header: 'Client Interview Status' },
  { key: 'status', header: 'Candidate Status' },
  { key: 'resumeUrl', header: 'Resume URL' },
  { key: 'remarks', header: 'Remarks' },
] as const;

export type CandidateColumnKey = (typeof CANDIDATE_COLUMNS)[number]['key'];

const SAMPLE_ROW: Record<CandidateColumnKey, string> = {
  candidateName: 'Ramesh Kumar',
  contactNumber: '9876543210',
  dateOfBirth: '1995-06-15',
  email: 'ramesh.kumar@example.com',
  qualification: 'B.Tech Mechanical',
  experience: '3 Years',
  designation: 'Technician',
  project: 'RIL Jamnagar',
  foraysInterviewStatus: 'NOT_STARTED',
  clientInterviewStatus: 'NOT_STARTED',
  status: 'APPLIED',
  resumeUrl: 'https://example.com/resume/ramesh-kumar.pdf',
  remarks: 'Sample row — delete before importing',
};

function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  return workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

export async function downloadCandidateTemplate(projectNames: string[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Forays Group HR Solutions';

  const sheet = workbook.addWorksheet('Candidates');
  sheet.columns = CANDIDATE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sheet.addRow(SAMPLE_ROW);

  const guidance = workbook.addWorksheet('Guidance (read me)');
  guidance.columns = [
    { header: 'Field', key: 'field', width: 28 },
    { header: 'Accepted values / notes', key: 'notes', width: 70 },
  ];
  guidance.getRow(1).font = { bold: true };
  guidance.addRows([
    { field: 'Candidate Name', notes: 'Required.' },
    { field: 'Contact Number', notes: 'Required. Digits only, 10-15 digits.' },
    { field: 'Date of Birth', notes: 'Optional. Format: YYYY-MM-DD.' },
    { field: 'Email', notes: 'Optional. Must be a valid email address if provided.' },
    { field: 'Experience', notes: 'Optional. Free text, e.g. "3 Years".' },
    { field: 'Designation', notes: 'Optional. Must match an existing designation name exactly (case-insensitive) if provided.' },
    {
      field: 'Assigned Project',
      notes: projectNames.length
        ? `Optional, but must match one of your assigned projects if provided: ${projectNames.join(', ')}`
        : 'Optional. Must match an existing project name if provided.',
    },
    { field: 'Forays Interview Status / Client Interview Status', notes: `One of: ${INTERVIEW_STAGES.join(', ')}` },
    { field: 'Candidate Status', notes: `One of: ${CANDIDATE_STATUSES.join(', ')}` },
    { field: 'Resume URL', notes: 'Optional. Must be a valid URL if provided.' },
    { field: 'Remarks', notes: 'Optional. Free text.' },
  ]);

  await downloadWorkbook(workbook, 'Candidate_Template.xlsx');
}

export interface RawCandidateRow {
  rowNumber: number;
  values: Record<CandidateColumnKey, string>;
}

/// Reads the uploaded workbook's first sheet, maps its header row to our
/// known column keys (case/whitespace-tolerant), and returns every
/// non-empty data row. Throws a user-friendly error for blank/corrupted
/// files or a header row that doesn't match the template at all.
export async function parseCandidateWorkbook(file: File): Promise<RawCandidateRow[]> {
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
  const columnIndexByKey = new Map<CandidateColumnKey, number>();
  headerRow.eachCell((cell, colNumber) => {
    const text = normalize(String(cell.value ?? ''));
    const match = CANDIDATE_COLUMNS.find((c) => normalize(c.header) === text);
    if (match) columnIndexByKey.set(match.key, colNumber);
  });

  const requiredHeaders: CandidateColumnKey[] = ['candidateName', 'contactNumber'];
  const missing = requiredHeaders.filter((k) => !columnIndexByKey.has(k));
  if (missing.length === CANDIDATE_COLUMNS.length || columnIndexByKey.size === 0) {
    throw new Error('The file headers do not match the Candidate Template. Please download the template and use it as-is.');
  }
  if (missing.length) {
    const labels = missing.map((k) => CANDIDATE_COLUMNS.find((c) => c.key === k)!.header).join(', ');
    throw new Error(`The file is missing required column(s): ${labels}. Please use the downloaded template.`);
  }

  const rows: RawCandidateRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0 || row.values == null) continue;

    const values = {} as Record<CandidateColumnKey, string>;
    let hasAnyValue = false;
    for (const col of CANDIDATE_COLUMNS) {
      const idx = columnIndexByKey.get(col.key);
      const cell = idx ? row.getCell(idx) : undefined;
      let text = '';
      if (cell?.value != null) {
        if (cell.value instanceof Date) {
          text = cell.value.toISOString().slice(0, 10);
        } else if (typeof cell.value === 'object' && 'text' in (cell.value as any)) {
          text = String((cell.value as any).text ?? '');
        } else if (typeof cell.value === 'object' && 'result' in (cell.value as any)) {
          text = String((cell.value as any).result ?? '');
        } else {
          text = String(cell.value).trim();
        }
      }
      values[col.key] = text;
      if (text) hasAnyValue = true;
    }

    if (hasAnyValue) rows.push({ rowNumber, values });
  }

  if (!rows.length) {
    throw new Error('No candidate rows were found below the header row.');
  }

  return rows;
}

export interface LookupOption {
  id: string;
  name: string;
}

export interface ValidatedCandidateRow {
  rowNumber: number;
  raw: Record<CandidateColumnKey, string>;
  candidateName: string;
  contactNumber: string;
  dateOfBirth: string | null;
  email: string | null;
  qualification: string | null;
  experience: string | null;
  designationId: string | null;
  projectId: string | null;
  foraysInterviewStatus: string;
  clientInterviewStatus: string;
  status: string;
  resumeUrl: string | null;
  remarks: string | null;
  errors: string[];
  isValid: boolean;
}

const PHONE_RE = /^[0-9]{10,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function findByName(list: LookupOption[], name: string): LookupOption | undefined {
  const target = name.trim().toLowerCase();
  return list.find((o) => o.name.trim().toLowerCase() === target);
}

function matchEnum(value: string, allowed: readonly string[], fallback: string): { value: string; error?: string } {
  if (!value) return { value: fallback };
  const norm = normalize(value);
  const match = allowed.find((a) => normalize(a) === norm);
  return match ? { value: match } : { value: fallback, error: `Unrecognized value "${value}"` };
}

export function validateCandidateRows(
  rawRows: RawCandidateRow[],
  lookups: { projects: LookupOption[]; designations: LookupOption[] }
): ValidatedCandidateRow[] {
  return rawRows.map((row) => {
    const errors: string[] = [];
    const v = row.values;

    const candidateName = v.candidateName.trim();
    if (!candidateName) errors.push('Candidate Name is required');

    const contactNumber = v.contactNumber.trim();
    if (!contactNumber) errors.push('Contact Number is required');
    else if (!PHONE_RE.test(contactNumber)) errors.push('Contact Number must be 10-15 digits');

    let dateOfBirth: string | null = null;
    if (v.dateOfBirth) {
      const parsed = new Date(v.dateOfBirth);
      if (Number.isNaN(parsed.getTime())) errors.push('Date of Birth is not a valid date');
      else dateOfBirth = parsed.toISOString().slice(0, 10);
    }

    let email: string | null = null;
    if (v.email) {
      if (!EMAIL_RE.test(v.email.trim())) errors.push('Email is not a valid email address');
      else email = v.email.trim();
    }

    let resumeUrl: string | null = null;
    if (v.resumeUrl) {
      try {
        // eslint-disable-next-line no-new
        new URL(v.resumeUrl.trim());
        resumeUrl = v.resumeUrl.trim();
      } catch {
        errors.push('Resume URL is not a valid URL');
      }
    }

    let designationId: string | null = null;
    if (v.designation) {
      const found = findByName(lookups.designations, v.designation);
      if (!found) errors.push(`Designation "${v.designation}" was not found`);
      else designationId = found.id;
    }

    let projectId: string | null = null;
    if (v.project) {
      const found = findByName(lookups.projects, v.project);
      if (!found) errors.push(`Project "${v.project}" was not found or is not one of your assigned projects`);
      else projectId = found.id;
    }

    const forays = matchEnum(v.foraysInterviewStatus, INTERVIEW_STAGES, 'NOT_STARTED');
    if (forays.error) errors.push(`Forays Interview Status: ${forays.error}`);

    const client = matchEnum(v.clientInterviewStatus, INTERVIEW_STAGES, 'NOT_STARTED');
    if (client.error) errors.push(`Client Interview Status: ${client.error}`);

    const status = matchEnum(v.status, CANDIDATE_STATUSES, 'APPLIED');
    if (status.error) errors.push(`Candidate Status: ${status.error}`);

    return {
      rowNumber: row.rowNumber,
      raw: v,
      candidateName,
      contactNumber,
      dateOfBirth,
      email,
      qualification: v.qualification.trim() || null,
      experience: v.experience.trim() || null,
      designationId,
      projectId,
      foraysInterviewStatus: forays.value,
      clientInterviewStatus: client.value,
      status: status.value,
      resumeUrl,
      remarks: v.remarks.trim() || null,
      errors,
      isValid: errors.length === 0,
    };
  });
}

export interface ImportFailureRow {
  rowNumber: number;
  candidateName: string;
  contactNumber: string;
  reason: string;
}

export async function downloadImportReport(failures: ImportFailureRow[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Failed Rows');
  sheet.columns = [
    { header: 'Row #', key: 'rowNumber', width: 10 },
    { header: 'Candidate Name', key: 'candidateName', width: 28 },
    { header: 'Contact Number', key: 'contactNumber', width: 20 },
    { header: 'Reason', key: 'reason', width: 60 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(failures);

  await downloadWorkbook(workbook, 'Import_Report.xlsx');
}
