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
  LucideIcon,
} from 'lucide-react';
import { ModuleName } from '../../types';

export interface NavItem {
  module: ModuleName;
  label: string;
  path: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
}

/// Single source of truth for the sidebar. Every entry is gated by
/// `can(module, 'view')` at render time — this list defines what's
/// *possible* to see, permissions decide what's *actually* shown.
export const NAV_ITEMS: NavItem[] = [
  { module: 'DASHBOARD', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { module: 'RECRUITMENT', label: 'Recruitment', path: '/recruitment', icon: UserPlus },
  { module: 'EMPLOYEES', label: 'Employees', path: '/employees', icon: Users },
  { module: 'ATTENDANCE', label: 'Attendance', path: '/attendance', icon: CalendarCheck },
  { module: 'WAGES', label: 'Wages', path: '/wages', icon: Wallet },
  { module: 'COMPLIANCE', label: 'Compliance', path: '/compliance', icon: ShieldCheck },
  { module: 'ADVANCES', label: 'Advances', path: '/advances', icon: HandCoins },
  { module: 'REPORTS', label: 'Reports', path: '/reports', icon: BarChart3 },
  { module: 'SETTINGS', label: 'Settings', path: '/settings', icon: Settings },
  { module: 'USER_MANAGEMENT', label: 'User Management', path: '/user-management', icon: UserCog, superAdminOnly: true },
  { module: 'USER_MANAGEMENT', label: 'Audit Logs', path: '/audit-logs', icon: ScrollText, superAdminOnly: true },
];
