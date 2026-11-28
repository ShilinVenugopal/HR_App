import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { APP_NAME } from '../config/branding';
import { BrandMark } from '../components/common/BrandMark';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Invalid email or password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-950 via-[#0d0c26] to-brand-900 px-4">
      {/* Subtle ambient glow + grid texture — purely decorative background. */}
      <div className="bg-grid-fade pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent-500/20 blur-[120px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size={60} rounded="rounded-2xl" />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">{APP_NAME}</h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-accent-300/90">
            <ShieldCheck size={14} /> Forays Group — HR / ERP Platform
          </p>
        </div>

        <form onSubmit={handleSubmit} className="animate-scale-in space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-card-hover backdrop-blur-xl">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-200">Email Address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                autoFocus
                className="input !border-white/10 !bg-white/5 !pl-10 !text-white placeholder:!text-slate-500 focus:!border-accent-400 focus:!ring-accent-400/25"
                placeholder="you@foraysgroup.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-200">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="input !border-white/10 !bg-white/5 !pl-10 !pr-10 !text-white placeholder:!text-slate-500 focus:!border-accent-400 focus:!ring-accent-400/25"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full !py-3">
            {loading && <Loader2 size={16} className="animate-spin" />}
            Sign In
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Access is restricted to authorized personnel and scoped to your assigned projects.
        </p>
      </div>
    </div>
  );
}
