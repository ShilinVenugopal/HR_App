import { createResourceApi } from './resource';
import { apiClient } from './client';

export interface Project {
  id: string;
  projectName: string;
  clientName: string;
  location?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}
export const projectsApi = createResourceApi<Project>('/projects');

export interface MasterItem {
  id: string;
  code?: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}
export const departmentsApi = createResourceApi<MasterItem>('/departments');
export const designationsApi = createResourceApi<MasterItem>('/designations');

export interface CostCode {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}
export const costCodesApi = createResourceApi<CostCode>('/cost-codes');

export interface AppUser {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: string;
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt?: string | null;
  createdAt: string;
  projects: { id: string; projectName: string }[];
  permissions?: Record<string, any>;
}
export const usersApi = {
  ...createResourceApi<AppUser>('/users'),
  disable: (id: string) => apiClient.patch(`/users/${id}/disable`).then((r) => r.data),
  enable: (id: string) => apiClient.patch(`/users/${id}/enable`).then((r) => r.data),
  resetPassword: (id: string, newPassword: string) =>
    apiClient.post(`/users/${id}/reset-password`, { newPassword }).then((r) => r.data),
};

export interface Candidate {
  id: string;
  candidateName: string;
  contactNumber: string;
  dateOfBirth?: string | null;
  qualification?: string | null;
  experience?: string | null;
  designationId?: string | null;
  designation?: { id: string; name: string } | null;
  email?: string | null;
  projectId?: string | null;
  project?: { id: string; projectName: string } | null;
  resumeUrl?: string | null;
  foraysInterviewStatus: string;
  clientInterviewStatus: string;
  remarks?: string | null;
  status: string;
  createdAt: string;
  employee?: { id: string } | null;
}
export const recruitmentApi = createResourceApi<Candidate>('/recruitment');

export interface BulkCandidateRowInput {
  rowNumber: number;
  candidateName: string;
  contactNumber: string;
  dateOfBirth?: string | null;
  qualification?: string | null;
  experience?: string | null;
  designationId?: string | null;
  email?: string | null;
  projectId?: string | null;
  resumeUrl?: string | null;
  foraysInterviewStatus: string;
  clientInterviewStatus: string;
  status: string;
  remarks?: string | null;
}
export interface DuplicateMatch {
  id: string;
  contactNumber: string;
  candidateName: string;
}
export interface BulkImportFailure {
  rowNumber: number;
  candidateName: string;
  contactNumber: string;
  reason: string;
}
export interface BulkImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  failures: BulkImportFailure[];
}
export const recruitmentBulkApi = {
  checkDuplicates: (contactNumbers: string[]) =>
    apiClient.post('/recruitment/bulk/check-duplicates', { contactNumbers }).then((r) => r.data.data as DuplicateMatch[]),
  import: (rows: BulkCandidateRowInput[], duplicateStrategy: 'skip' | 'update') =>
    apiClient.post('/recruitment/bulk/import', { rows, duplicateStrategy }).then((r) => r.data.data as BulkImportResult),
};

export interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  fatherName?: string | null;
  contactNumber: string;
  email?: string | null;
  dateOfBirth?: string | null;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  designationId?: string | null;
  designation?: { id: string; name: string } | null;
  projectId: string;
  project?: { id: string; projectName: string } | null;
  joiningDate?: string | null;
  reportingManagerId?: string | null;
  reportingManager?: { id: string; name: string; employeeCode: string } | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  passportNumber?: string | null;
  pfNumber?: string | null;
  uanNumber?: string | null;
  esicNumber?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  address?: string | null;
  status: string;
  createdAt: string;
}

export interface EmployeeDuplicateMatch {
  id: string;
  employeeCode: string;
  aadhaarNumber: string | null;
  name: string;
}

export interface EmployeeBulkImportFailure {
  rowNumber: number;
  employeeCode: string;
  name: string;
  reason: string;
}

export interface EmployeeBulkImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  failures: EmployeeBulkImportFailure[];
}

export const employeesApi = {
  ...createResourceApi<Employee>('/employees'),
  convertCandidate: (candidateId: string) =>
    apiClient.post(`/employees/from-candidate/${candidateId}`).then((r) => r.data),
  checkDuplicates: (employeeCodes: string[], aadhaarNumbers: string[]) =>
    apiClient.post('/employees/bulk/check-duplicates', { employeeCodes, aadhaarNumbers }).then((r) => r.data.data as EmployeeDuplicateMatch[]),
  bulkImport: (rows: unknown[], duplicateStrategy: 'skip' | 'update') =>
    apiClient.post('/employees/bulk/import', { rows, duplicateStrategy }).then((r) => r.data.data as EmployeeBulkImportResult),
};

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employee?: { id: string; name: string; employeeCode: string };
  projectId: string;
  project?: { id: string; projectName: string };
  date: string;
  shift: string;
  inTime?: string | null;
  outTime?: string | null;
  status: string;
  overtimeHours: number;
  approvalStatus: string;
  isLocked: boolean;
  remarks?: string | null;
}
export const attendanceApi = {
  ...createResourceApi<AttendanceRecord>('/attendance'),
  approve: (id: string) => apiClient.patch(`/attendance/${id}/approve`).then((r) => r.data),
  reject: (id: string) => apiClient.patch(`/attendance/${id}/reject`).then((r) => r.data),
  lock: (id: string) => apiClient.patch(`/attendance/${id}/lock`).then((r) => r.data),
  unlock: (id: string) => apiClient.patch(`/attendance/${id}/unlock`).then((r) => r.data),
};

export interface WageRecord {
  id: string;
  employeeId: string;
  employee?: { id: string; name: string; employeeCode: string };
  projectId: string;
  project?: { id: string; projectName: string };
  month: number;
  year: number;
  presentDays: number;
  overtimeHours: number;
  basicWage: number;
  allowances: number;
  overtimeAmount: number;
  grossWage: number;
  pfDeduction: number;
  esicDeduction: number;
  advanceRecovery: number;
  otherDeductions: number;
  netWage: number;
  status: string;
}
export const wagesApi = {
  ...createResourceApi<WageRecord>('/wages'),
  approve: (id: string) => apiClient.patch(`/wages/${id}/approve`).then((r) => r.data),
  markPaid: (id: string) => apiClient.patch(`/wages/${id}/mark-paid`).then((r) => r.data),
};

// ── Project-wise Wages (template-driven) ──────────────────────────────

export type WageColumnType = 'text' | 'number' | 'date';

export type WageFormulaSpec =
  | { op: 'PRORATE'; base: string; workingDays: string; daysPaid: string }
  | { op: 'MULTIPLY'; a: string; b: string }
  | { op: 'PERCENT'; field: string; percent: number }
  | { op: 'SUM'; fields: string[] }
  | { op: 'CAP_SUM'; fields: string[]; max: number }
  | { op: 'SLAB2'; field: string; threshold: number; amountAbove: number }
  | { op: 'SUBTRACT'; from: string; fields: string[] };

export interface WageColumnDef {
  key: string;
  label: string;
  section: string;
  type: WageColumnType;
  formula?: WageFormulaSpec;
  required?: boolean;
  isEmployeeId?: boolean;
  isEmployeeName?: boolean;
  isGrossTotal?: boolean;
  isDeductionsTotal?: boolean;
  isNetTotal?: boolean;
  validator?: 'UAN12';
  isTextFormat?: boolean;
  width?: number;
}

export interface WageTemplateSummary {
  code: string;
  name: string;
  projectId: string;
  projectName: string;
}

export interface WageTemplateDetail extends WageTemplateSummary {
  columns: WageColumnDef[];
}

export interface WageEntry {
  id: string;
  templateId: string;
  projectId: string;
  uploadId: string | null;
  month: number;
  year: number;
  employeeCode: string;
  employeeName: string;
  data: Record<string, string | number | null>;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  createdAt: string;
  updatedAt: string;
}

export interface WageImportRowInput {
  rowNumber: number;
  values: Record<string, string | number | null>;
}

export interface WageImportError {
  row: number;
  message: string;
}

export interface WageImportResult {
  upload: { id: string; status: string; totalRows: number; importedRows: number; failedRows: number };
  imported: number;
  failed: number;
  total: number;
  errors: WageImportError[];
}

export interface WageMonthlySummary {
  totalEmployees: number;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
}

export const projectWagesApi = {
  listTemplates: () => apiClient.get('/project-wages/templates').then((r) => r.data.data as WageTemplateSummary[]),
  getTemplate: (code: string) => apiClient.get(`/project-wages/${code}`).then((r) => r.data.data as WageTemplateDetail),
  listEntries: (code: string, month: number, year: number, search?: string) =>
    apiClient
      .get(`/project-wages/${code}/entries`, { params: { month, year, search } })
      .then((r) => r.data.data as { columns: WageColumnDef[]; entries: WageEntry[] }),
  getSummary: (code: string, month: number, year: number) =>
    apiClient.get(`/project-wages/${code}/summary`, { params: { month, year } }).then((r) => r.data.data as WageMonthlySummary),
  getHistory: (code: string, employeeCode: string) =>
    apiClient.get(`/project-wages/${code}/history/${employeeCode}`).then((r) => r.data.data as { columns: WageColumnDef[]; entries: WageEntry[] }),
  createEntry: (code: string, payload: { month: number; year: number; values: Record<string, string | number | null> }) =>
    apiClient.post(`/project-wages/${code}/entries`, payload).then((r) => r.data.data as WageEntry),
  updateEntry: (code: string, id: string, values: Record<string, string | number | null>) =>
    apiClient.put(`/project-wages/${code}/entries/${id}`, { values }).then((r) => r.data.data as WageEntry),
  deleteEntry: (code: string, id: string) => apiClient.delete(`/project-wages/${code}/entries/${id}`),
  import: (code: string, payload: { month: number; year: number; fileName: string; fileUrl: string; rows: WageImportRowInput[] }) =>
    apiClient.post(`/project-wages/${code}/import`, payload).then((r) => r.data.data as WageImportResult),
};

export interface ComplianceRecord {
  id: string;
  projectId: string;
  project?: { id: string; projectName: string };
  employeeId?: string | null;
  employee?: { id: string; name: string } | null;
  type: string;
  referenceNumber?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  status: string;
  remarks?: string | null;
}
export const complianceApi = {
  ...createResourceApi<ComplianceRecord>('/compliance'),
  expiringSoon: (days = 30) => apiClient.get('/compliance/expiring-soon', { params: { days } }).then((r) => r.data.data),
};

export interface Advance {
  id: string;
  employeeId: string;
  employee?: { id: string; name: string; employeeCode: string };
  projectId: string;
  project?: { id: string; projectName: string };
  type: string;
  amount: number;
  reason?: string | null;
  installments: number;
  recoveredAmount: number;
  status: string;
  recoveries?: { id: string; month: number; year: number; amount: number }[];
}
export const advancesApi = {
  ...createResourceApi<Advance>('/advances'),
  approve: (id: string) => apiClient.patch(`/advances/${id}/approve`).then((r) => r.data),
  reject: (id: string) => apiClient.patch(`/advances/${id}/reject`).then((r) => r.data),
  addRecovery: (id: string, payload: { month: number; year: number; amount: number }) =>
    apiClient.post(`/advances/${id}/recoveries`, payload).then((r) => r.data),
};

export const dashboardApi = {
  summary: () => apiClient.get('/dashboard/summary').then((r) => r.data.data),
};

export const reportsApi = {
  manpower: () => apiClient.get('/reports/manpower').then((r) => r.data.data),
  employees: () => apiClient.get('/reports/employees').then((r) => r.data.data),
  attendance: (params?: { dateFrom?: string; dateTo?: string }) =>
    apiClient.get('/reports/attendance', { params }).then((r) => r.data.data),
  recruitment: () => apiClient.get('/reports/recruitment').then((r) => r.data.data),
  payroll: (params?: { month?: number; year?: number }) => apiClient.get('/reports/payroll', { params }).then((r) => r.data.data),
};

export interface AuditLogRow {
  id: string;
  userId?: string | null;
  userEmail?: string | null;
  user?: { id: string; name: string; email: string } | null;
  action: string;
  module?: string | null;
  project?: { id: string; projectName: string } | null;
  ipAddress?: string | null;
  device?: string | null;
  browser?: string | null;
  status: string;
  details?: unknown;
  createdAt: string;
}
export const auditLogsApi = {
  list: (params?: Record<string, unknown>) => apiClient.get('/audit-logs', { params }).then((r) => r.data),
};

export const uploadsApi = {
  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await apiClient.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return data.data as { url: string; originalName: string };
  },
};

// ── Bulk Communication ──────────────────────────────────────────────────

export type CommChannel = 'EMAIL' | 'WHATSAPP';

export interface CommunicationTemplate {
  id: string;
  name: string;
  channel: CommChannel;
  category?: string | null;
  subject?: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationBatch {
  id: string;
  channel: CommChannel;
  templateId?: string | null;
  subject?: string | null;
  body: string;
  attachments?: { filename: string; url: string }[] | null;
  scheduledAt?: string | null;
  status: string;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  failedCount: number;
  bouncedCount: number;
  createdAt: string;
}

export interface CommunicationMessageLog {
  id: string;
  batchId: string;
  candidateId: string;
  channel: CommChannel;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  subject?: string | null;
  body: string;
  status: string;
  errorReason?: string | null;
  attempts: number;
  scheduledAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  openedAt?: string | null;
  failedAt?: string | null;
  bouncedAt?: string | null;
  createdAt: string;
  candidate?: { id: string; candidateName: string; email?: string | null; contactNumber: string };
  project?: { id: string; projectName: string } | null;
  batch?: {
    id: string;
    template?: { id: string; name: string } | null;
    createdBy?: { id: string; name: string } | null;
    attachments?: { filename: string; url: string }[] | null;
  };
}

export interface CommunicationStats {
  emailsSentToday: number;
  whatsappSentToday: number;
  pendingScheduled: number;
  failedMessages: number;
  openRate: number;
  responseRate: number;
}

export interface CommunicationConfig {
  emailConfigured: boolean;
  whatsappConfigured: boolean;
}

export interface TestSendResult {
  success: boolean;
  providerMessageId?: string;
  errorReason?: string;
}

export interface BulkSendPayload {
  channel: CommChannel;
  candidateIds: string[];
  templateId?: string | null;
  subject?: string;
  body: string;
  attachments?: { filename: string; url: string }[];
  scheduledAt?: string | null;
  variables?: Record<string, string>;
}

export const communicationApi = {
  templates: {
    list: (channel?: CommChannel) =>
      apiClient.get('/communication/templates', { params: channel ? { channel } : {} }).then((r) => r.data.data as CommunicationTemplate[]),
    create: (payload: Partial<CommunicationTemplate>) =>
      apiClient.post('/communication/templates', payload).then((r) => r.data.data as CommunicationTemplate),
    update: (id: string, payload: Partial<CommunicationTemplate>) =>
      apiClient.put(`/communication/templates/${id}`, payload).then((r) => r.data.data as CommunicationTemplate),
    duplicate: (id: string) => apiClient.post(`/communication/templates/${id}/duplicate`).then((r) => r.data.data as CommunicationTemplate),
    remove: (id: string) => apiClient.delete(`/communication/templates/${id}`),
  },
  send: (payload: BulkSendPayload) => apiClient.post('/communication/send', payload).then((r) => r.data.data as CommunicationBatch),
  sendTest: (payload: { channel: CommChannel; subject?: string; body: string; testRecipient: string; variables?: Record<string, string> }) =>
    apiClient.post('/communication/send-test', payload).then((r) => r.data.data as TestSendResult),
  history: (params?: Record<string, unknown>) => apiClient.get('/communication/history', { params }).then((r) => r.data),
  resend: (id: string) => apiClient.patch(`/communication/history/${id}/resend`).then((r) => r.data.data as CommunicationMessageLog),
  timeline: (candidateId: string) =>
    apiClient.get(`/communication/candidates/${candidateId}/timeline`).then((r) => r.data.data as CommunicationMessageLog[]),
  stats: () => apiClient.get('/communication/stats').then((r) => r.data.data as CommunicationStats),
  config: () => apiClient.get('/communication/config').then((r) => r.data.data as CommunicationConfig),
};

// ─────────────────────────────────────────────────────────────────────────
// PROCUREMENT — Inventory
// ─────────────────────────────────────────────────────────────────────────

export type InventoryUnit = 'NOS' | 'MTR' | 'LOT' | 'EA' | 'KG' | 'TON' | 'LITER';

export interface InventoryItem {
  id: string;
  projectId: string;
  project?: { id: string; projectName: string } | null;
  costCodeId: string;
  costCode?: { id: string; code: string; name: string } | null;
  itemDescription: string;
  unit: InventoryUnit;
  workingQuantity: string | number;
  nonWorkingQuantity: string | number;
  remarks?: string | null;
  date: string;
  createdById?: string | null;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
}

export interface BulkInventoryRowInput {
  rowNumber: number;
  projectId: string;
  costCodeId: string;
  itemDescription: string;
  unit: InventoryUnit;
  workingQuantity: number;
  nonWorkingQuantity: number;
  remarks?: string | null;
  date?: string | null;
}

export interface InventoryDuplicateMatch {
  id: string;
  projectId: string;
  costCodeId: string;
  itemDescription: string;
  project?: { id: string; projectName: string } | null;
  costCode?: { id: string; code: string; name: string } | null;
}

export interface InventoryBulkImportFailure {
  rowNumber: number;
  itemDescription: string;
  reason: string;
}

export interface InventoryBulkImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  failures: InventoryBulkImportFailure[];
}

export const inventoryApi = {
  ...createResourceApi<InventoryItem>('/inventory'),
  checkDuplicates: (items: { projectId: string; costCodeId: string; itemDescription: string }[]) =>
    apiClient.post('/inventory/bulk/check-duplicates', { items }).then((r) => r.data.data as InventoryDuplicateMatch[]),
  bulkImport: (rows: BulkInventoryRowInput[], duplicateStrategy: 'skip' | 'update') =>
    apiClient.post('/inventory/bulk/import', { rows, duplicateStrategy }).then((r) => r.data.data as InventoryBulkImportResult),
};
