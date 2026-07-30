import { createResourceApi } from './resource';
import { apiClient } from './client';

export interface Project {
  id: string;
  projectName: string;
  clientName: string;
  location?: string | null;
  projectNumber?: string | null;
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

export interface ProcurementDashboardSummary {
  cards: {
    pendingPrApprovals: number;
    pendingPoApprovals: number;
    pendingGrnApprovals: number;
    totalInventoryItems: number;
    totalWorkingQuantity: number;
    totalNonWorkingQuantity: number;
  };
  charts: {
    prStatus: { status: string; count: number }[];
    poStatus: { status: string; count: number }[];
    grnStatus: { status: string; count: number }[];
    spendTrend: { month: string; total: number }[];
    topVendors: { vendorId: string; vendorName: string; totalValue: number }[];
  };
}

export const procurementDashboardApi = {
  summary: (): Promise<ProcurementDashboardSummary> => apiClient.get('/procurement-dashboard/summary').then((r) => r.data.data),
};

export const reportsApi = {
  manpower: () => apiClient.get('/reports/manpower').then((r) => r.data.data),
  employees: () => apiClient.get('/reports/employees').then((r) => r.data.data),
  attendance: (params?: { dateFrom?: string; dateTo?: string }) =>
    apiClient.get('/reports/attendance', { params }).then((r) => r.data.data),
  recruitment: () => apiClient.get('/reports/recruitment').then((r) => r.data.data),
  payroll: (params?: { month?: number; year?: number }) => apiClient.get('/reports/payroll', { params }).then((r) => r.data.data),
  procurementSummary: () => apiClient.get('/reports/procurement-summary').then((r) => r.data.data),
  vendorSpend: () => apiClient.get('/reports/vendor-spend').then((r) => r.data.data),
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

// ─────────────────────────────────────────────────────────────────────────
// PROCUREMENT — Purchase Requisition
// ─────────────────────────────────────────────────────────────────────────

export type PRStatus = 'DRAFT' | 'SUBMITTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'RETURNED';

export interface PurchaseRequisitionItem {
  id: string;
  costCodeId: string;
  costCode?: { id: string; code: string; name: string } | null;
  materialName: string;
  unit: InventoryUnit;
  totalReqQty: string | number;
  make?: string | null;
  modelNo?: string | null;
  qtyAvailableAtSite: string | number;
  balQtyReq: string | number;
  remarks?: string | null;
  sortOrder: number;
}

export interface ApprovalRecord {
  id: string;
  action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'RETURN';
  actedById?: string | null;
  actedBy?: { id: string; name: string } | null;
  comments?: string | null;
  createdAt: string;
}

export interface PurchaseRequisition {
  id: string;
  projectId: string;
  project?: { id: string; projectName: string; projectNumber?: string | null } | null;
  requestNumber: string;
  prNumber?: string | null;
  requesterId: string;
  requester?: { id: string; name: string; email: string } | null;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  siteInchargeName?: string | null;
  storeInchargeName?: string | null;
  status: PRStatus;
  currentApproverId?: string | null;
  currentApprover?: { id: string; name: string; email: string } | null;
  submittedAt?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  items: PurchaseRequisitionItem[];
  approvalHistory?: ApprovalRecord[];
}

export interface PrItemInput {
  costCodeId: string;
  materialName: string;
  unit: InventoryUnit;
  totalReqQty: number;
  make?: string;
  modelNo?: string;
  qtyAvailableAtSite?: number;
  remarks?: string;
}

export interface PrCreateInput {
  projectId: string;
  prNumber?: string;
  departmentId?: string;
  siteInchargeName?: string;
  storeInchargeName?: string;
  items: PrItemInput[];
}

export interface ApproverOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export const purchaseRequisitionsApi = {
  ...createResourceApi<PurchaseRequisition>('/purchase-requisitions'),
  // Overridden: the create/update payload shape (PrCreateInput, with plain
  // PrItemInput[] items) differs from PurchaseRequisition's own read shape
  // (items: PurchaseRequisitionItem[], with server-computed fields like
  // balQtyReq) — the generic createResourceApi<T> assumes both match.
  create: (payload: PrCreateInput) =>
    apiClient.post('/purchase-requisitions', payload).then((r) => r.data as { data: PurchaseRequisition }),
  update: (id: string, payload: Partial<PrCreateInput>) =>
    apiClient.put(`/purchase-requisitions/${id}`, payload).then((r) => r.data as { data: PurchaseRequisition }),
  approvers: (projectId: string) =>
    apiClient.get('/purchase-requisitions/approvers', { params: { projectId } }).then((r) => r.data.data as ApproverOption[]),
  submit: (id: string, approverId: string) =>
    apiClient.post(`/purchase-requisitions/${id}/submit`, { approverId }).then((r) => r.data.data as PurchaseRequisition),
  approve: (id: string, comments?: string) =>
    apiClient.post(`/purchase-requisitions/${id}/approve`, { comments }).then((r) => r.data.data as PurchaseRequisition),
  reject: (id: string, comments: string) =>
    apiClient.post(`/purchase-requisitions/${id}/reject`, { comments }).then((r) => r.data.data as PurchaseRequisition),
  returnToRequester: (id: string, comments: string) =>
    apiClient.post(`/purchase-requisitions/${id}/return`, { comments }).then((r) => r.data.data as PurchaseRequisition),
  unlock: (id: string) => apiClient.patch(`/purchase-requisitions/${id}/unlock`).then((r) => r.data.data as PurchaseRequisition),
};

// ─────────────────────────────────────────────────────────────────────────
// PROCUREMENT — Vendors
// ─────────────────────────────────────────────────────────────────────────

export interface Vendor {
  id: string;
  name: string;
  address?: string | null;
  gstNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  contactPerson?: string | null;
  active: boolean;
  createdAt: string;
}
export const vendorsApi = createResourceApi<Vendor>('/vendors');

// ─────────────────────────────────────────────────────────────────────────
// PROCUREMENT — Purchase Order
// ─────────────────────────────────────────────────────────────────────────

export type POStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface PurchaseOrderItem {
  id: string;
  costCodeId?: string | null;
  costCode?: { id: string; code: string; name: string } | null;
  description: string;
  unit: InventoryUnit;
  qty: string | number;
  rate: string | number;
  amount: string | number;
  gstPercent: string | number;
  gstAmount: string | number;
  extendedPrice: string | number;
  remarks?: string | null;
  sortOrder: number;
}

export interface PurchaseOrder {
  id: string;
  projectId: string;
  project?: { id: string; projectName: string; projectNumber?: string | null } | null;
  prId?: string | null;
  pr?: { id: string; requestNumber: string; prNumber?: string | null } | null;
  poNumber: string;
  poDate: string;
  vendorId: string;
  vendor?: Vendor | null;
  enquiryNoDate?: string | null;
  quotationNo?: string | null;
  ref?: string | null;
  jobNo?: string | null;
  deliveryDate?: string | null;
  packingForwarding: string | number;
  transportationCharges: string | number;
  taxesAndDuties: string | number;
  subtotal: string | number;
  grandTotal: string | number;
  billingAddress?: string | null;
  billingGstNumber?: string | null;
  termsAndConditions?: Record<string, string> | null;
  signatureImageUrl?: string | null;
  authorizedName?: string | null;
  authorizedDesignation?: string | null;
  status: POStatus;
  createdById: string;
  createdBy?: { id: string; name: string; email: string } | null;
  approvedById?: string | null;
  approvedBy?: { id: string; name: string; email: string } | null;
  approvedAt?: string | null;
  createdAt: string;
  items: PurchaseOrderItem[];
  approvalHistory?: ApprovalRecord[];
}

export interface PoItemInput {
  costCodeId?: string;
  description: string;
  unit: InventoryUnit;
  qty: number;
  rate: number;
  gstPercent?: number;
  remarks?: string;
}

export interface PoCreateInput {
  projectId: string;
  prId?: string;
  poNumber: string;
  poDate?: string;
  vendorId: string;
  enquiryNoDate?: string;
  quotationNo?: string;
  ref?: string;
  jobNo?: string;
  deliveryDate?: string;
  packingForwarding?: number;
  transportationCharges?: number;
  taxesAndDuties?: number;
  items: PoItemInput[];
}

export interface PoSettingsInput {
  billingAddress?: string;
  billingGstNumber?: string;
  termsAndConditions?: Record<string, string>;
  signatureImageUrl?: string;
  authorizedName?: string;
  authorizedDesignation?: string;
}

export const purchaseOrdersApi = {
  ...createResourceApi<PurchaseOrder>('/purchase-orders'),
  // Overridden for the same reason as purchaseRequisitionsApi: the
  // create/update payload shape differs from PurchaseOrder's read shape.
  create: (payload: PoCreateInput) => apiClient.post('/purchase-orders', payload).then((r) => r.data as { data: PurchaseOrder }),
  update: (id: string, payload: Partial<PoCreateInput>) =>
    apiClient.put(`/purchase-orders/${id}`, payload).then((r) => r.data as { data: PurchaseOrder }),
  approvers: (projectId: string) => apiClient.get('/purchase-orders/approvers', { params: { projectId } }).then((r) => r.data.data as ApproverOption[]),
  submit: (id: string, approverId: string) => apiClient.post(`/purchase-orders/${id}/submit`, { approverId }).then((r) => r.data.data as PurchaseOrder),
  approve: (id: string, comments?: string) => apiClient.post(`/purchase-orders/${id}/approve`, { comments }).then((r) => r.data.data as PurchaseOrder),
  reject: (id: string, comments: string) => apiClient.post(`/purchase-orders/${id}/reject`, { comments }).then((r) => r.data.data as PurchaseOrder),
  unlock: (id: string) => apiClient.patch(`/purchase-orders/${id}/unlock`).then((r) => r.data.data as PurchaseOrder),
  updateSettings: (id: string, payload: PoSettingsInput) =>
    apiClient.patch(`/purchase-orders/${id}/settings`, payload).then((r) => r.data.data as PurchaseOrder),
};

// ─────────────────────────────────────────────────────────────────────────
// PROCUREMENT — Goods Received Note (GRN)
// ─────────────────────────────────────────────────────────────────────────

export type GRNStatus = 'DRAFT' | 'SUBMITTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'RETURNED';

export interface GoodsReceivedNoteItem {
  id: string;
  costCodeId?: string | null;
  costCode?: { id: string; code: string; name: string } | null;
  description: string;
  unit: InventoryUnit;
  qtyAsPerChallan: string | number;
  actualQtyReceived: string | number;
  acceptedQty: string | number;
  rejectedQty: string | number;
  remarks?: string | null;
  sortOrder: number;
}

export interface GoodsReceivedNote {
  id: string;
  projectId: string;
  project?: { id: string; projectName: string; projectNumber?: string | null } | null;
  poId: string;
  po?: { id: string; poNumber: string; poDate: string; vendor?: { id: string; name: string } | null } | null;
  grnNumber: string;
  grnDate: string;
  supplierName?: string | null;
  receiptDate?: string | null;
  challanNumber?: string | null;
  challanDate?: string | null;
  lrNumber?: string | null;
  lrDate?: string | null;
  transporterName?: string | null;
  status: GRNStatus;
  submittedById?: string | null;
  submittedBy?: { id: string; name: string; email: string } | null;
  currentApproverId?: string | null;
  currentApprover?: { id: string; name: string; email: string } | null;
  submittedAt?: string | null;
  decidedAt?: string | null;
  inventoryUpdatedAt?: string | null;
  inventoryUpdatedBy?: { id: string; name: string } | null;
  createdAt: string;
  items: GoodsReceivedNoteItem[];
  approvalHistory?: ApprovalRecord[];
}

export interface GrnItemInput {
  costCodeId?: string;
  description: string;
  unit: InventoryUnit;
  qtyAsPerChallan: number;
  actualQtyReceived: number;
  acceptedQty: number;
  remarks?: string;
}

export interface GrnCreateInput {
  projectId: string;
  poId: string;
  supplierName?: string;
  receiptDate?: string;
  challanNumber?: string;
  challanDate?: string;
  lrNumber?: string;
  lrDate?: string;
  transporterName?: string;
  items: GrnItemInput[];
}

export const grnsApi = {
  ...createResourceApi<GoodsReceivedNote>('/grns'),
  // Overridden for the same reason as purchaseRequisitionsApi/purchaseOrdersApi.
  create: (payload: GrnCreateInput) => apiClient.post('/grns', payload).then((r) => r.data as { data: GoodsReceivedNote }),
  update: (id: string, payload: Partial<GrnCreateInput>) =>
    apiClient.put(`/grns/${id}`, payload).then((r) => r.data as { data: GoodsReceivedNote }),
  approvers: (projectId: string) => apiClient.get('/grns/approvers', { params: { projectId } }).then((r) => r.data.data as ApproverOption[]),
  submit: (id: string, approverId: string) => apiClient.post(`/grns/${id}/submit`, { approverId }).then((r) => r.data.data as GoodsReceivedNote),
  approve: (id: string, comments?: string) => apiClient.post(`/grns/${id}/approve`, { comments }).then((r) => r.data.data as GoodsReceivedNote),
  reject: (id: string, comments: string) => apiClient.post(`/grns/${id}/reject`, { comments }).then((r) => r.data.data as GoodsReceivedNote),
  returnToSubmitter: (id: string, comments: string) => apiClient.post(`/grns/${id}/return`, { comments }).then((r) => r.data.data as GoodsReceivedNote),
  unlock: (id: string) => apiClient.patch(`/grns/${id}/unlock`).then((r) => r.data.data as GoodsReceivedNote),
  updateInventory: (id: string) => apiClient.post(`/grns/${id}/update-inventory`).then((r) => r.data.data as GoodsReceivedNote),
};

// ─────────────────────────────────────────────────────────────────────────
// PROCUREMENT — Notifications
// ─────────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'PR_SUBMITTED'
  | 'PR_APPROVED'
  | 'PR_REJECTED'
  | 'PR_RETURNED'
  | 'PO_PENDING'
  | 'PO_APPROVED'
  | 'PO_REJECTED'
  | 'GRN_PENDING'
  | 'GRN_APPROVED'
  | 'GRN_REJECTED'
  | 'GRN_RETURNED'
  | 'INVENTORY_UPDATED';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  documentType?: 'PR' | 'PO' | 'GRN' | null;
  documentId?: string | null;
  isRead: boolean;
  createdAt: string;
}

export const notificationsApi = {
  list: (params?: { page?: number; pageSize?: number; unreadOnly?: boolean }) =>
    apiClient
      .get('/notifications', { params })
      .then((r) => r.data as { data: { rows: AppNotification[]; unreadCount: number }; meta: { total: number; page: number; pageSize: number } }),
  markRead: (id: string) => apiClient.patch(`/notifications/${id}/read`).then((r) => r.data.data as AppNotification),
  markAllRead: () => apiClient.patch('/notifications/read-all'),
};
