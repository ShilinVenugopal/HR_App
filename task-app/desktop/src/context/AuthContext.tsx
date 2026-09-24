import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getProfile } from '@/lib/api';
import type { Profile } from '@/lib/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  /** Message shown on the login screen after a forced sign-out. */
  notice: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(notice?: string): Promise<void>;
  refreshProfile(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// UX hint only — the allowed_email_domains table + auth trigger is what
// actually rejects other domains. Comma-separated, e.g. "foraysgroup.in,foraysgroup.com".
export const COMPANY_DOMAINS = String(import.meta.env.VITE_COMPANY_DOMAINS || 'foraysgroup.in')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const signOut = useCallback(
    async (message?: string) => {
      await supabase.auth.signOut().catch(() => undefined);
      queryClient.clear();
      setProfile(null);
      setSession(null);
      setNotice(message ?? null);
    },
    [queryClient],
  );

  const loadProfile = useCallback(
    async (s: Session | null) => {
      if (!s) {
        setProfile(null);
        return;
      }
      try {
        const p = await getProfile(s.user.id);
        if (p.status !== 'active') {
          await signOut('Your account has been deactivated. Please contact your administrator.');
          return;
        }
        setProfile(p);
      } catch (err) {
        // Offline at start-up: keep the cached session; profile loads on reconnect.
        console.warn('Could not load profile', err);
      }
    },
    [signOut],
  );

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (mounted) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') setProfile(null);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') void loadProfile(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Signed in but profile not loaded (e.g. started offline): keep retrying.
  useEffect(() => {
    if (!session || profile || loading) return;
    const retry = () => void loadProfile(session);
    const timer = window.setInterval(retry, 5000);
    window.addEventListener('online', retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retry);
    };
  }, [session, profile, loading, loadProfile]);

  // Keep the tray menu in sync and honour "Logout" from the tray.
  useEffect(() => {
    window.forays?.setSignedIn(Boolean(session && profile));
  }, [session, profile]);
  useEffect(() => window.forays?.onLogoutRequest(() => void signOut()), [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const clean = email.trim().toLowerCase();
    const domain = clean.split('@')[1] ?? '';
    if (!COMPANY_DOMAINS.includes(domain)) {
      throw new Error(`Please sign in with your Forays Group e-mail (@${COMPANY_DOMAINS[0]}).`);
    }
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({ email: clean, password });
    if (error) {
      if (/invalid login credentials/i.test(error.message)) throw new Error('Incorrect e-mail or password.');
      if (/banned/i.test(error.message)) throw new Error('Your account has been deactivated. Please contact your administrator.');
      if (/fetch/i.test(error.message)) throw new Error('Cannot reach the server. Check your internet connection.');
      throw new Error(error.message);
    }
  }, []);

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      isAdmin: profile?.role === 'admin' && profile.status === 'active',
      notice,
      signIn,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, notice, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For pages rendered only when signed in. */
export function useMe() {
  const { profile } = useAuth();
  if (!profile) throw new Error('useMe used without a signed-in profile');
  return profile;
}
