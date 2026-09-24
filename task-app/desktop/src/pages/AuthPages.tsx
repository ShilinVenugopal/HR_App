import { useState, type FormEvent } from 'react';
import { KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { COMPANY_DOMAINS, useAuth } from '@/context/AuthContext';
import { Logo, TitleBar } from '@/components/Layout';
import { Button, Field } from '@/components/ui';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { clearMustChangePassword } from '@/lib/api';

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-navy-950 p-6">
        {/* subtle futuristic backdrop */}
        <div className="pointer-events-none absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand-600/25 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-accent-500/15 blur-[120px]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(#4f8cff 1px, transparent 1px), linear-gradient(90deg, #4f8cff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div className="relative grid w-full max-w-4xl animate-fade-in overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl backdrop-blur-xl md:grid-cols-2">
          <div className="hidden flex-col justify-between bg-gradient-to-br from-navy-800/80 to-brand-900/60 p-10 md:flex">
            <div className="flex items-center gap-3">
              <Logo className="h-11 w-11" />
              <div>
                <div className="text-sm font-bold tracking-[0.25em] text-white">FORAYS</div>
                <div className="text-[11px] tracking-[0.3em] text-accent-300">TASK APP</div>
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-semibold leading-tight text-white">
                Assign. Track.
                <br />
                <span className="bg-gradient-to-r from-accent-300 to-brand-300 bg-clip-text text-transparent">Deliver together.</span>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Tasks, deadlines, reminders and team chat for Forays Group, synced live wherever your team is working from.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 text-accent-400" /> Restricted to authorised Forays Group accounts
            </div>
          </div>
          <div className="bg-white p-10">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { signIn, notice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold text-navy-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">Use your official Forays Group e-mail ID.</p>

      {!supabaseConfigured && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This build has no server configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in desktop/.env and rebuild.
        </div>
      )}
      {notice && <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</div>}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="E-mail">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              type="email"
              autoFocus
              autoComplete="username"
              placeholder={`name@${COMPANY_DOMAINS[0]}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </Field>
        <Field label="Password">
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </Field>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <Button type="submit" loading={busy} className="w-full py-2.5">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-xs text-slate-400">
        No account or forgot your password? Ask your Forays Task App administrator to add you or reset it.
      </p>
    </AuthShell>
  );
}

export function ChangePasswordPage() {
  const { refreshProfile, signOut, profile } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
      setError('Use at least 10 characters with letters and numbers.');
      return;
    }
    if (pw !== pw2) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw new Error(err.message);
      await clearMustChangePassword();
      await refreshProfile();
      toast.success('Password updated');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <KeyRound className="h-5 w-5" />
      </div>
      <h1 className="text-2xl font-semibold text-navy-900">Set your password</h1>
      <p className="mt-1 text-sm text-slate-500">
        Welcome{profile ? `, ${profile.full_name.split(' ')[0]}` : ''}! Replace the temporary password from your administrator.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="New password" hint="At least 10 characters, letters and numbers">
          <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </Field>
        <Field label="Confirm new password">
          <input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <Button type="submit" loading={busy} className="w-full py-2.5">
          Save password
        </Button>
        <button type="button" onClick={() => void signOut()} className="w-full text-center text-xs text-slate-400 hover:text-slate-600">
          Sign out
        </button>
      </form>
    </AuthShell>
  );
}
