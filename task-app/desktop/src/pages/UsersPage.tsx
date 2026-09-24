// Admin-only user management. The route is hidden for non-admins, but the
// real protection is server-side: RLS for profile edits and the admin-users
// Edge Function (which re-checks the caller is an active Admin).
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Search, UserCheck, UserPlus, UserX, Users } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { COMPANY_DOMAINS } from '@/context/AuthContext';
import { useMe } from '@/context/AuthContext';
import { adminCreateUser, adminResetPassword, adminSetStatus, adminUpdateProfile, listAllUsers, listRoles } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import type { Profile } from '@/lib/types';
import { Avatar, Button, EmptyState, ErrorBox, Field, Modal, PageHeader, PageLoader } from '@/components/ui';

function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = crypto.getRandomValues(new Uint32Array(10));
  return 'Fy' + Array.from(arr, (n) => chars[n % chars.length]).join('') + '7';
}

interface UserForm {
  email: string;
  full_name: string;
  employee_code: string;
  department: string;
  designation: string;
  mobile: string;
  role: string;
  password: string;
}

const emptyForm = (): UserForm => ({
  email: '',
  full_name: '',
  employee_code: '',
  department: '',
  designation: '',
  mobile: '',
  role: 'user',
  password: tempPassword(),
});

function UserModal({ user, onClose }: { user: Profile | 'new' | null; onClose(): void }) {
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const isNew = user === 'new';
  const [form, setForm] = useState<UserForm>(() =>
    user && user !== 'new'
      ? {
          email: user.email,
          full_name: user.full_name,
          employee_code: user.employee_code ?? '',
          department: user.department ?? '',
          designation: user.designation ?? '',
          mobile: user.mobile ?? '',
          role: user.role,
          password: '',
        }
      : emptyForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof UserForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) {
        await adminCreateUser({ ...form, email: form.email.trim().toLowerCase() });
      } else if (user) {
        await adminUpdateProfile(user.id, {
          full_name: form.full_name.trim(),
          employee_code: form.employee_code.trim() || null,
          department: form.department.trim() || null,
          designation: form.designation.trim() || null,
          mobile: form.mobile.trim() || null,
          role: form.role,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      if (isNew) {
        void navigator.clipboard?.writeText(`${form.email}\n${form.password}`).catch(() => undefined);
        toast.success('User added. E-mail and temporary password copied to clipboard.', { duration: 6000 });
      } else toast.success('User updated');
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.full_name.trim()) return setError('Employee name is required.');
    if (isNew) {
      const domain = form.email.trim().toLowerCase().split('@')[1];
      if (!COMPANY_DOMAINS.includes(domain ?? '')) return setError(`E-mail must be a Forays Group address (@${COMPANY_DOMAINS[0]}).`);
    }
    save.mutate();
  }

  return (
    <Modal
      open={Boolean(user)}
      title={isNew ? 'Add user' : 'Edit user'}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {isNew ? 'Add user' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee name">
          <input className="input" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} autoFocus />
        </Field>
        <Field label="Official e-mail">
          <input className="input" type="email" value={form.email} disabled={!isNew} placeholder={`name@${COMPANY_DOMAINS[0]}`} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Employee code">
          <input className="input" value={form.employee_code} onChange={(e) => set('employee_code', e.target.value)} />
        </Field>
        <Field label="Mobile number">
          <input className="input" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
        </Field>
        <Field label="Department">
          <input className="input" value={form.department} onChange={(e) => set('department', e.target.value)} />
        </Field>
        <Field label="Designation">
          <input className="input" value={form.designation} onChange={(e) => set('designation', e.target.value)} />
        </Field>
        <Field label="Role">
          <select className="input" value={form.role} onChange={(e) => set('role', e.target.value)}>
            {(roles.data ?? [{ code: 'user', name: 'User' }, { code: 'admin', name: 'Admin' }]).map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        {isNew && (
          <Field label="Temporary password" hint="The user must change it at first sign-in.">
            <div className="flex gap-2">
              <input className="input font-mono" value={form.password} onChange={(e) => set('password', e.target.value)} />
              <Button type="button" variant="secondary" size="sm" onClick={() => set('password', tempPassword())}>
                New
              </Button>
            </div>
          </Field>
        )}
        {error && (
          <div className="sm:col-span-2">
            <ErrorBox error={new Error(error)} />
          </div>
        )}
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ['users', 'all'], queryFn: listAllUsers });
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [resetFor, setResetFor] = useState<Profile | null>(null);
  const [resetPw, setResetPw] = useState('');

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) => adminSetStatus(id, status),
    onSuccess: (_d, v) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(v.status === 'active' ? 'User activated' : 'User deactivated');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const reset = useMutation({
    mutationFn: () => adminResetPassword(resetFor!.id, resetPw),
    onSuccess: () => {
      void navigator.clipboard?.writeText(resetPw).catch(() => undefined);
      toast.success('Password reset. Temporary password copied to clipboard.');
      setResetFor(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (users.data ?? []).filter(
      (u) =>
        (!roleFilter || u.role === roleFilter) &&
        (!statusFilter || u.status === statusFilter) &&
        (!q || [u.full_name, u.email, u.employee_code, u.department, u.designation].some((f) => f?.toLowerCase().includes(q))),
    );
  }, [users.data, search, roleFilter, statusFilter]);

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Add colleagues, manage roles and control who can sign in."
        actions={
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Add user
          </Button>
        }
      />
      {users.error && <ErrorBox error={users.error} />}
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search name, e-mail, code, department…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-36" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
          <select className="input w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        {users.isLoading ? (
          <PageLoader />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No users found" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Department / Designation</th>
                <th className="px-4 py-3 font-semibold">Mobile</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Added</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => (
                <tr key={u.id} className={clsx(u.status === 'inactive' && 'opacity-60')}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.full_name} size="sm" />
                      <div>
                        <div className="font-medium text-slate-800">
                          {u.full_name}
                          {u.employee_code && <span className="ml-1.5 text-xs text-slate-400">#{u.employee_code}</span>}
                        </div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{[u.department, u.designation].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{u.mobile || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', u.role === 'admin' ? 'bg-navy-900 text-accent-300' : 'bg-slate-100 text-slate-600')}>
                      {u.role === 'admin' ? 'Admin' : u.role === 'user' ? 'User' : u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', u.status === 'active' ? 'text-emerald-600' : 'text-slate-500')}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full', u.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400')} />
                      {u.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit" onClick={() => setEditing(u)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Reset password"
                        onClick={() => {
                          setResetPw(tempPassword());
                          setResetFor(u);
                        }}
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      {u.id !== me.id &&
                        (u.status === 'active' ? (
                          <button
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            title="Deactivate"
                            onClick={() => window.confirm(`Deactivate ${u.full_name}? They will be signed out and unable to log in.`) && setStatus.mutate({ id: u.id, status: 'inactive' })}
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            className="rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                            title="Activate"
                            onClick={() => setStatus.mutate({ id: u.id, status: 'active' })}
                          >
                            <UserCheck className="h-4 w-4" />
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && <UserModal user={editing} onClose={() => setEditing(null)} />}

      <Modal
        open={Boolean(resetFor)}
        title={`Reset password — ${resetFor?.full_name ?? ''}`}
        onClose={() => setResetFor(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetFor(null)}>
              Cancel
            </Button>
            <Button loading={reset.isPending} onClick={() => reset.mutate()}>
              Reset password
            </Button>
          </>
        }
      >
        <Field label="New temporary password" hint="Share it with the user securely; they must change it at next sign-in.">
          <input className="input font-mono" value={resetPw} onChange={(e) => setResetPw(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
