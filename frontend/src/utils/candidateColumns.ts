/// Column order/labels here are the single source of truth for the
/// downloadable template, the uploaded-file header mapping, the Export
/// Excel headers, the candidate listing, and Customize Columns — keep them
/// in sync with the Recruitment "Add Candidate" form fields.
///
/// Deliberately kept in its own module with no `exceljs` dependency: it's
/// imported statically by Recruitment.tsx to build the listing table and
/// the Customize Columns picker on every page load, while the actual Excel
/// read/write logic in excelImport.ts (which pulls in the ~945KB exceljs
/// library) stays dynamically imported so it never bloats the initial
/// Recruitment page chunk.
export const CANDIDATE_COLUMNS = [
  { key: 'candidateName', header: 'Candidate Name' },
  { key: 'contactNumber', header: 'Contact Number' },
  { key: 'dateOfBirth', header: 'Date of Birth' },
  { key: 'email', header: 'Email' },
  { key: 'qualification', header: 'Qualification' },
  { key: 'experience', header: 'Experience' },
  { key: 'designation', header: 'Designation' },
  { key: 'project', header: 'Assigned Project' },
  { key: 'costCode', header: 'Employee Cost Code' },
  { key: 'foraysInterviewStatus', header: 'Forays Interview Status' },
  { key: 'clientInterviewStatus', header: 'Client Interview Status' },
  { key: 'status', header: 'Candidate Status' },
  { key: 'resumeUrl', header: 'Resume URL' },
  { key: 'remarks', header: 'Remarks' },
] as const;

export type CandidateColumnKey = (typeof CANDIDATE_COLUMNS)[number]['key'];

/// Columns shown by default in the Candidate listing and Export Excel
/// before the user customizes their column selection via Customize
/// Columns. Any column omitted here is still available to enable.
export const DEFAULT_VISIBLE_CANDIDATE_COLUMNS: CandidateColumnKey[] = [
  'candidateName',
  'contactNumber',
  'project',
  'designation',
  'experience',
  'costCode',
  'foraysInterviewStatus',
  'clientInterviewStatus',
  'status',
];
