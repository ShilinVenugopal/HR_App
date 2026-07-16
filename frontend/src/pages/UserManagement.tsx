import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, KeyRound, Ban, CheckCircle2, Trash2, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppUser, usersApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Badge } from '../components/common/Badge';
import { MultiSelect } from '../components/common/MultiSelect';
import { PermissionMatrixEditor } from '../components/common/PermissionMatrixEditor';
import { useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';
import { ALL_MODULES, emptyPermissionMatrix, ModuleName, PermissionMatrix, ROLE_LABELS } from '../types';

const ROLES: { value: string; label: string }[] = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

const emptyForm = {
  name: '',
  email: '',
  mobile: '',
  password: '',
  confirmPassword: '',
  role: 'HR_EXECUTIVE',
  status: 'ACTIVE',
  projectIds: [] as string[],
  permissions: emptyPermissionMatrix(),
};

function permissionsToArray(matrix: PermissionMatrix) {
  return ALL_MODULES.filter((m) => m !== 'USER_MANAGEMENT').map((module) => ({ module, ...matrix[module] }));
}

export default function UserManagement() {
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [viewTarget, setViewTarget] = useState<AppUser | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, search],
    queryFn: () => usersApi.list({ page, pageSize: 10, search }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = async (user: AppUser) => {
    const detail = await usersApi.get(user.id);
    const u = detail.data;
    const matrix = emptyPermissionMatrix();
    if (u.permissions) {
      for (const mod of ALL_MODULES) {
        const p = (u.permissions as any)[mod];
        if (p) matrix[mod] = { canView: p.canView, canAdd: p.canAdd, canEdit: p.canEdit, canDelete: p.canDelete, canApprove: p.canApprove };
      }
    }
    setEditing(u as AppUser);
    setForm({
      name: u.name,
      email: u.email,
      mobile: u.mobile,
      password: '',
      confirmPassword: '',
      role: u.role,
      status: u.status,
      projectIds: u.projects.map((p) => p.id),
      permissions: matrix,
    });
    setErrors({});
    setModalOpen(true);
  };

  const openView = async (user: AppUser) => {
    const detail = await usersApi.get(user.id);
    setViewTarget(detail.data as AppUser);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const permissions = permissionsToArray(form.permissions);
      if (editing) {
        return usersApi.update(editing.id, {
          name: form.name,
          mobile: form.mobile,
          role: form.role as any,
          status: form.status as any,
          projectIds: form.projectIds,
          permissions,
        } as any);
      }
      return usersApi.create({
        name: form.name,
        email: form.email,
        mobile: form.mobile,
        password: form.password,
        confirmPassword: form.confirmPassword,
        role: form.role as any,
        status: form.status as any,
        projectIds: form.projectIds,
        permissions,
      } as any);
    },
    onSuccess: () => {
      toast.success(editing ? 'User updated successfully' : 'User created successfully');
      setModalOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const disableMutation = useMutation({
    mutationFn: (user: AppUser) => (user.status === 'ACTIVE' ? usersApi.disable(user.id) : usersApi.enable(user.id)),
    onSuccess: (_data, user) => {
      toast.success(user.status === 'ACTIVE' ? 'User disabled' : 'User enabled');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      toast.success('User deleted');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const resetMutation = useMutation({
    mutationFn: () => usersApi.resetPassword(resetTarget!.id, resetPassword),
    onSuccess: () => {
      toast.success('Password reset successfully');
      setResetTarget(null);
      setResetPassword('');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Full name is required';
    if (!editing && !/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email';
    if (!form.mobile.trim()) next.mobile = 'Mobile number is required';
    if (!editing) {
      if (form.password.length < 8) next.password = 'Password must be at least 8 characters';
      if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      toast.error('Please correct the highlighted fields');
      return;
    }
    saveMutation.mutate();
  };

  const columns: Column<AppUser>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'email', header: 'Email', render: (r) => r.email },
    { key: 'mobile', header: 'Mobile', render: (r) => r.mobile },
    { key: 'role', header: 'Role', render: (r) => ROLE_LABELS[r.role as keyof typeof ROLE_LABELS] ?? r.role },
    {
      key: 'projects',
      header: 'Assigned Projects',
      render: (r) =>
        r.role === 'SUPER_ADMIN' ? (
          <span className="text-xs text-slate-500">All Projects</span>
        ) : r.projects.length ? (
          <div className="flex flex-wrap gap-1">
            {r.projects.slice(0, 2).map((p) => (
              <span key={p.id} className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {p.projectName}
              </span>
            ))}
            {r.projects.length > 2 && <span className="text-xs text-slate-400">+{r.projects.length - 2} more</span>}
          </div>
        ) : (
          <span className="text-xs text-slate-400">None</span>
        ),
    },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title="User Management" description="Create users, assign projects and configure the permission matrix" />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={search}
        searchPlaceholder="Search users..."
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        headerActions={
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add User
          </button>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <button className="btn-ghost p-1.5" title="View Permissions" onClick={() => openView(row)}>
              <Eye size={15} />
            </button>
            <button className="btn-ghost p-1.5" title="Edit" onClick={() => openEdit(row)}>
              <Pencil size={15} />
            </button>
            <button className="btn-ghost p-1.5" title="Reset Password" onClick={() => setResetTarget(row)}>
              <KeyRound size={15} />
            </button>
            <button
              className="btn-ghost p-1.5"
              title={row.status === 'ACTIVE' ? 'Disable User' : 'Enable User'}
              onClick={() => disableMutation.mutate(row)}
            >
              {row.status === 'ACTIVE' ? <Ban size={15} className="text-amber-600" /> : <CheckCircle2 size={15} className="text-emerald-600" />}
            </button>
            <button className="btn-ghost p-1.5 text-red-500" title="Delete" onClick={() => setDeleteTarget(row)}>
              <Trash2 size={15} />
            </button>
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit User' : 'Add User'}
        size="xl"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saveMutation.isPending} onClick={handleSubmit}>
              Save User
            </button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>
            <div>
              <label className="label">Email *</label>
              <input
                type="email"
                className="input"
                disabled={Boolean(editing)}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
            </div>
            <div>
              <label className="label">Mobile Number *</label>
              <input className="input" value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} />
              {errors.mobile && <p className="mt-1 text-xs text-red-500">{errors.mobile}</p>}
            </div>
            <div>
              <label className="label">Role *</label>
              <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            {!editing && (
              <>
                <div>
                  <label className="label">Password *</label>
                  <input type="password" className="input" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                  {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
                </div>
                <div>
                  <label className="label">Confirm Password *</label>
                  <input
                    type="password"
                    className="input"
                    value={form.confirmPassword}
                    onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  />
                  {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>}
                </div>
              </>
            )}
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Assigned Projects</label>
            <MultiSelect
              options={projectOptions}
              selected={form.projectIds}
              onChange={(values) => setForm((f) => ({ ...f, projectIds: values }))}
              placeholder="Select assigned projects..."
            />
            <p className="mt-1 text-xs text-slate-400">
              A user can belong to multiple projects. Super Administrators implicitly have unrestricted access regardless of this selection.
            </p>
          </div>

          <div>
            <label className="label">Permission Matrix</label>
            <PermissionMatrixEditor
              value={form.permissions}
              onChange={(next) => setForm((f) => ({ ...f, permissions: next }))}
              disabled={form.role === 'SUPER_ADMIN'}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete User"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset Password — ${resetTarget?.name ?? ''}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setResetTarget(null)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={resetMutation.isPending} onClick={() => resetMutation.mutate()}>
              Reset Password
            </button>
          </>
        }
      >
        <label className="label">New Password</label>
        <input type="password" className="input" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
        <p className="mt-2 text-xs text-slate-400">
          The user will be required to change this password and all their active sessions will be signed out.
        </p>
      </Modal>

      <Modal open={Boolean(viewTarget)} onClose={() => setViewTarget(null)} title={`Permissions — ${viewTarget?.name ?? ''}`} size="lg">
        {viewTarget && (
          <PermissionMatrixEditor
            value={
              (() => {
                const matrix = emptyPermissionMatrix();
                for (const mod of ALL_MODULES) {
                  const p = (viewTarget.permissions as any)?.[mod];
                  if (p) matrix[mod as ModuleName] = { canView: p.canView, canAdd: p.canAdd, canEdit: p.canEdit, canDelete: p.canDelete, canApprove: p.canApprove };
                }
                return matrix;
              })()
            }
            onChange={() => {}}
            disabled
          />
        )}
      </Modal>
    </div>
  );
}
