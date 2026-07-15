import { createContext, useContext, useMemo, useState, ReactNode, useCallback } from 'react';
import * as authApi from '../api/auth.api';
import { clearSession, loadSession, saveSession } from '../api/client';
import { AuthSession, ModuleName, PermissionClaim } from '../types';

type PermissionAction = 'view' | 'add' | 'edit' | 'delete' | 'approve';
const ACTION_KEY: Record<PermissionAction, keyof PermissionClaim> = {
  view: 'canView',
  add: 'canAdd',
  edit: 'canEdit',
  delete: 'canDelete',
  approve: 'canApprove',
};

interface AuthContextValue {
  session: AuthSession | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (module: ModuleName, action: PermissionAction) => boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    saveSession(result);
    setSession(result);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout(session?.refreshToken);
    } catch {
      // ignore network errors on logout — clear local session regardless
    }
    clearSession();
    setSession(null);
  }, [session]);

  const isSuperAdmin = session?.user.role === 'SUPER_ADMIN';

  const can = useCallback(
    (module: ModuleName, action: PermissionAction) => {
      if (!session) return false;
      if (isSuperAdmin) return true;
      const claim = session.permissions[module];
      return Boolean(claim?.[ACTION_KEY[action]]);
    },
    [session, isSuperAdmin]
  );

  const value = useMemo<AuthContextValue>(
    () => ({ session, isAuthenticated: Boolean(session), login, logout, can, isSuperAdmin }),
    [session, login, logout, can, isSuperAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
