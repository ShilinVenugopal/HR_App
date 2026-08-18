import {
  LayoutDashboard,
  UserPlus,
  Users,
  CalendarCheck,
  Wallet,
  ShieldCheck,
  HandCoins,
  BarChart3,
  Settings,
  UserCog,
  ScrollText,
  Boxes,
  FileSpreadsheet,
  ClipboardList,
  PackageCheck,
  Receipt,
  BookOpenText,
  Tags,
  Store,
  PieChart,
  LayoutGrid,
  Banknote,
  Ticket,
  ListTodo,
  UserCheck2,
  PlusCircle,
  ListChecks,
  LucideIcon,
} from 'lucide-react';
import { ModuleName } from '../../types';

export interface NavItem {
  /// Omit only when `alwaysVisible` is set — every other item is gated by
  /// `can(module, requiredAction ?? 'view')`.
  module?: ModuleName;
  label: string;
  path: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
  /// Shown to every authenticated user regardless of the permission
  /// matrix — for reference data like Cost Code Master, where mutations
  /// are Super-Admin-gated directly rather than through a per-user
  /// permission a Super Admin would otherwise have to remember to grant
  /// just so people can view it.
  alwaysVisible?: boolean;
  /// Overrides the default 'view' gate — e.g. "All Tickets" needs the
  /// elevated TICKETS canApprove flag (org-wide visibility), not just base
  /// module access, while every other Tickets nav entry stays gated by
  /// plain 'view'. Super Admin always bypasses regardless of this.
  requiredAction?: 'view' | 'add' | 'edit' | 'delete' | 'approve';
}

/// Single source of truth for the sidebar. Every entry is gated by
/// `can(module, 'view')` at render time (unless `alwaysVisible` or
/// `superAdminOnly`) — this list defines what's *possible* to see,
/// permissions decide what's *actually* shown.
export const NAV_ITEMS: NavItem[] = [
  { module: 'DASHBOARD', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { module: 'RECRUITMENT', label: 'Recruitment', path: '/recruitment', icon: UserPlus },
  { module: 'EMPLOYEES', label: 'Employees', path: '/employees', icon: Users },
  { module: 'ATTENDANCE', label: 'Attendance', path: '/attendance', icon: CalendarCheck },
  { module: 'ATTENDANCE', label: 'Manpower Summary', path: '/manpower-summary', icon: PieChart },
  { module: 'ATTENDANCE', label: 'Unit Management', path: '/unit-management', icon: LayoutGrid },
  { module: 'WAGES', label: 'Wages', path: '/wages', icon: Wallet },
  { module: 'COMPLIANCE', label: 'Compliance', path: '/compliance', icon: ShieldCheck },
  { module: 'ADVANCES', label: 'Advances', path: '/advances', icon: HandCoins },
  { module: 'EXPENSE', label: 'Expense', path: '/expense', icon: Banknote },
  { module: 'INVENTORY', label: 'Inventory', path: '/inventory', icon: Boxes },
  { module: 'PURCHASE_REQUISITION', label: 'Purchase Requisition', path: '/purchase-requisitions', icon: FileSpreadsheet },
  { module: 'PURCHASE_ORDER', label: 'Purchase Order', path: '/purchase-orders', icon: ClipboardList },
  { module: 'PURCHASE_ORDER', label: 'Vendor Management', path: '/vendors', icon: Store },
  { module: 'GRN', label: 'Goods Received Note', path: '/grns', icon: PackageCheck },
  { module: 'PROCUREMENT_DASHBOARD', label: 'Procurement Dashboard', path: '/procurement-dashboard', icon: LayoutDashboard },
  { module: 'BILLING_STATUS', label: 'Billing Status', path: '/billing-status', icon: Receipt },
  { module: 'SITE_ACCOUNTS', label: 'Site Accounts', path: '/site-accounts', icon: BookOpenText },
  { label: 'Cost Code Master', path: '/cost-code-master', icon: Tags, alwaysVisible: true },
  { module: 'TICKETS', label: 'Ticket Dashboard', path: '/tickets/dashboard', icon: Ticket },
  { module: 'TICKETS', label: 'My Tickets', path: '/tickets/my', icon: ListTodo },
  { module: 'TICKETS', label: 'Assigned to Me', path: '/tickets/assigned', icon: UserCheck2 },
  { module: 'TICKETS', label: 'Raise New Ticket', path: '/tickets/new', icon: PlusCircle, requiredAction: 'add' },
  { module: 'TICKETS', label: 'All Tickets', path: '/tickets/all', icon: ListChecks, requiredAction: 'approve' },
  { module: 'REPORTS', label: 'Reports', path: '/reports', icon: BarChart3 },
  { module: 'SETTINGS', label: 'Settings', path: '/settings', icon: Settings },
  { module: 'USER_MANAGEMENT', label: 'User Management', path: '/user-management', icon: UserCog, superAdminOnly: true },
  { module: 'USER_MANAGEMENT', label: 'Audit Logs', path: '/audit-logs', icon: ScrollText, superAdminOnly: true },
];
