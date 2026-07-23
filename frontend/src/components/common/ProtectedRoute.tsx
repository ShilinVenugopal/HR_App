import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ModuleName } from '../../types';

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/// Frontend route guard mirroring the backend's requirePermission — purely
/// UX (hides/redirects), never the source of truth. The API enforces the
/// same rule independently, so a forged request still gets a 403.
export function RequireModule({ module, children }: { module: ModuleName; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(module, 'view')) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin } = useAuth();
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
