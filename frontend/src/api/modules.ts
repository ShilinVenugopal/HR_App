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
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}
export const departmentsApi = createResourceApi<MasterItem>('/departments');
export const designationsApi = createResourceApi<MasterItem>('/designations');

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
}
export const recruitmentApi = createResourceApi<Candidate>('/recruitment');

export interface Employee {
  id: string;
  employeeCode: string;
  employeeId?: string | null;
  name: string;
  contactNumber?: string | null;
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
  status: string;
  createdAt: string;
}
export const employeesApi = {
  ...createResourceApi<Employee>('/employees'),
  convertCandidate: (candidateId: string) =>
    apiClient.post(`/employees/from-candidate/${candidateId}`).then((r) => r.data),
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
