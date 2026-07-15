export type Role = 'SUPER_ADMIN' | 'SITE_ADMIN' | 'HR_EXECUTIVE' | 'PROJECT_MANAGER' | 'FINANCE';

export type ModuleName =
  | 'DASHBOARD'
  | 'RECRUITMENT'
  | 'EMPLOYEES'
  | 'ATTENDANCE'
  | 'WAGES'
  | 'COMPLIANCE'
  | 'ADVANCES'
  | 'REPORTS'
  | 'SETTINGS'
  | 'USER_MANAGEMENT';

export const ALL_MODULES: ModuleName[] = [
  'DASHBOARD',
  'RECRUITMENT',
  'EMPLOYEES',
  'ATTENDANCE',
  'WAGES',
  'COMPLIANCE',
  'ADVANCES',
  'REPORTS',
  'SETTINGS',
  'USER_MANAGEMENT',
];

export const MODULE_LABELS: Record<ModuleName, string> = {
  DASHBOARD: 'Dashboard',
  RECRUITMENT: 'Recruitment',
  EMPLOYEES: 'Employees',
  ATTENDANCE: 'Attendance',
  WAGES: 'Wages',
  COMPLIANCE: 'Compliance',
  ADVANCES: 'Advances',
  REPORTS: 'Reports',
  SETTINGS: 'Settings',
  USER_MANAGEMENT: 'User Management',
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Administrator',
  SITE_ADMIN: 'Site Administrator',
  HR_EXECUTIVE: 'HR Executive',
  PROJECT_MANAGER: 'Project Manager',
  FINANCE: 'Finance',
};

export interface PermissionClaim {
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

export type PermissionMatrix = Record<ModuleName, PermissionClaim>;

export function emptyPermissionMatrix(): PermissionMatrix {
  return Object.fromEntries(
    ALL_MODULES.map((m) => [m, { canView: false, canAdd: false, canEdit: false, canDelete: false, canApprove: false }])
  ) as PermissionMatrix;
}

export interface TokenProject {
  id: string;
  projectName: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mobile?: string;
  status?: 'ACTIVE' | 'DISABLED';
  mustResetPassword?: boolean;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: CurrentUser;
  projects: TokenProject[];
  permissions: PermissionMatrix;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiListResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  meta?: PaginationMeta;
}

export interface ApiSingleResponse<T> {
  success: boolean;
  message: string;
  data: T;
}
