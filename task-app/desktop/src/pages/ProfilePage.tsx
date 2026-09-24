import { useMutation } from '@tanstack/react-query';
import { LogOut, Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useAuth, useMe } from '@/context/AuthContext';
import { updateOwnProfile } from '@/lib/api';
import { Avatar, Button, Field, PageHeader } from '@/components/ui';

export default function ProfilePage() {
  const me = useMe();
  const { refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(me.full_name);
  const [mobile, setMobile] = useState(me.mobile ?? '');

  const save = useMutation({
    mutationFn: () => updateOwnProfile(me.id, { full_name: fullName.trim(), mobile: mobile.trim() || null }),
    onSuccess: async () => {
      await refreshProfile();
      toast.success('Profile updated');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return toast.error('Name cannot be empty');
    save.mutate();
  }

  const readOnly: [string, string | null][] = [
    ['E-mail', me.email],
    ['Employee code', me.employee_code],
    ['Department', me.department],
    ['Designation', me.designation],
    ['Role', me.role === 'admin' ? 'Admin' : 'User'],
    ['Time zone', me.timezone],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My Profile" />
      <div className="card overflow-hidden">
        <div className="relative h-24 bg-gradient-to-r from-navy-800 via-brand-700 to-accent-600">
          <div className="absolute -bottom-8 left-6 rounded-full ring-4 ring-white">
            <Avatar name={me.full_name} size="lg" />
          </div>
        </div>
        <div className="px-6 pb-6 pt-12">
          <div className="text-xl font-semibold text-navy-900">{me.full_name}</div>
          <div className="text-sm text-slate-500">{[me.designation, me.department].filter(Boolean).join(' · ') || me.email}</div>

          <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Mobile number">
              <input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            </Field>
            {readOnly.map(([label, value]) => (
              <Field key={label} label={label}>
                <input className="input" value={value || '—'} disabled />
              </Field>
            ))}
            <div className="flex items-center justify-between gap-2 sm:col-span-2">
              <span className="text-xs text-slate-400">
                Department, designation and role are managed by your administrator. Notification preferences are in{' '}
                <Link to="/settings" className="text-brand-600 hover:underline">
                  Settings
                </Link>
                .
              </span>
              <Button type="submit" loading={save.isPending} icon={<Save className="h-4 w-4" />}>
                Save
              </Button>
            </div>
          </form>
        </div>
      </div>
      <Button variant="secondary" className="mt-6 text-rose-600" icon={<LogOut className="h-4 w-4" />} onClick={() => void signOut()}>
        Logout
      </Button>
    </div>
  );
}
