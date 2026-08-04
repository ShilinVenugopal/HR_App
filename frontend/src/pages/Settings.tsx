import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { departmentsApi, designationsApi, MasterItem, Project, projectsApi, Vendor, vendorsApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';

const TABS = [
  { key: 'projects', label: 'Projects' },
  { key: 'designations', label: 'Designations' },
  { key: 'departments', label: 'Departments' },
  { key: 'vendors', label: 'Vendors' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function SettingsPage() {
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = useState<TabKey>('projects');

  return (
    <div>
      <PageHeader title="Settings" description="Master data configuration" />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'projects' && <ProjectsTab isSuperAdmin={isSuperAdmin} />}
      {tab === 'designations' && <MasterTab entity="designation" />}
      {tab === 'departments' && <MasterTab entity="department" />}
      {tab === 'vendors' && <VendorsTab />}
    </div>
  );
}

function ProjectsTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<{ projectName: string; clientName: string; location: string; projectNumber: string; status: 'ACTIVE' | 'INACTIVE' }>({
    projectName: '',
    clientName: '',
    location: '',
    projectNumber: '',
    status: 'ACTIVE',
  });
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['projects', page, search],
    queryFn: () => projectsApi.list({ page, pageSize: 10, search }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ projectName: '', clientName: '', location: '', projectNumber: '', status: 'ACTIVE' });
    setModalOpen(true);
  };
  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({ projectName: p.projectName, clientName: p.clientName, location: p.location ?? '', projectNumber: p.projectNumber ?? '', status: p.status });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => (editing ? projectsApi.update(editing.id, form) : projectsApi.create(form)),
    onSuccess: () => {
      toast.success(editing ? 'Project updated' : 'Project created');
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['lookup-projects'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: () => {
      toast.success('Project deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: Column<Project>[] = [
    { key: 'projectName', header: 'Project Name', render: (r) => <span className="font-medium">{r.projectName}</span> },
    { key: 'projectNumber', header: 'Project No.', render: (r) => r.projectNumber ?? '—' },
    { key: 'clientName', header: 'Client', render: (r) => r.clientName },
    { key: 'location', header: 'Location', render: (r) => r.location ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
  ];

  return (
    <div>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={search}
        searchPlaceholder="Search projects..."
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        headerActions={
          isSuperAdmin && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> Add Project
            </button>
          )
        }
        rowActions={
          isSuperAdmin
            ? (row) => (
                <div className="flex justify-end gap-1">
                  <button className="btn-ghost p-1.5" onClick={() => openEdit(row)}>
                    <Pencil size={15} />
                  </button>
                  <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteTarget(row)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            : undefined
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Project' : 'Add Project'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              Save
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Project Name *</label>
            <input className="input" value={form.projectName} onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))} />
          </div>
          <div>
            <label className="label">Client Name *</label>
            <input className="input" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          </div>
          <div>
            <label className="label">Project No.</label>
            <input
              className="input"
              value={form.projectNumber}
              onChange={(e) => setForm((f) => ({ ...f, projectNumber: e.target.value }))}
              placeholder="Shown on printed procurement documents (PR/PO/GRN)"
            />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Project"
        message={`Delete "${deleteTarget?.projectName}"? Projects with linked employees/candidates cannot be deleted — set them Inactive instead.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}

function MasterTab({ entity }: { entity: 'designation' | 'department' }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const api = entity === 'designation' ? designationsApi : departmentsApi;
  const queryKey = entity === 'designation' ? 'designations' : 'departments';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MasterItem | null>(null);
  const [form, setForm] = useState<{ name: string; status: 'ACTIVE' | 'INACTIVE' }>({ name: '', status: 'ACTIVE' });
  const [deleteTarget, setDeleteTarget] = useState<MasterItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [queryKey, page, search],
    queryFn: () => api.list({ page, pageSize: 10, search }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', status: 'ACTIVE' });
    setModalOpen(true);
  };
  const openEdit = (item: MasterItem) => {
    setEditing(item);
    setForm({ name: item.name, status: item.status });
    setModalOpen(true);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [queryKey] });
    queryClient.invalidateQueries({ queryKey: [`lookup-${queryKey}`] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => (editing ? api.update(editing.id, form) : api.create(form)),
    onSuccess: () => {
      toast.success('Saved successfully');
      setModalOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => {
      toast.success('Deleted successfully');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: Column<MasterItem>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
  ];

  const label = entity === 'designation' ? 'Designation' : 'Department';

  return (
    <div>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={search}
        searchPlaceholder={`Search ${label.toLowerCase()}s...`}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        headerActions={
          can('SETTINGS', 'add') && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> Add {label}
            </button>
          )
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {can('SETTINGS', 'edit') && (
              <button className="btn-ghost p-1.5" onClick={() => openEdit(row)}>
                <Pencil size={15} />
              </button>
            )}
            {can('SETTINGS', 'delete') && (
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteTarget(row)}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${label}` : `Add ${label}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              Save
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${label}`}
        message={`Delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}

const emptyVendorForm = { name: '', address: '', gstNumber: '', email: '', phone: '', contactPerson: '', active: true };

function VendorsTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyVendorForm);
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', page, search],
    queryFn: () => vendorsApi.list({ page, pageSize: 10, search }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyVendorForm);
    setModalOpen(true);
  };
  const openEdit = (v: Vendor) => {
    setEditing(v);
    setForm({
      name: v.name,
      address: v.address ?? '',
      gstNumber: v.gstNumber ?? '',
      email: v.email ?? '',
      phone: v.phone ?? '',
      contactPerson: v.contactPerson ?? '',
      active: v.active,
    });
    setModalOpen(true);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['vendors'] });
    queryClient.invalidateQueries({ queryKey: ['lookup-vendors'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => (editing ? vendorsApi.update(editing.id, form) : vendorsApi.create(form)),
    onSuccess: () => {
      toast.success('Saved successfully');
      setModalOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vendorsApi.remove(id),
    onSuccess: () => {
      toast.success('Deleted successfully');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: Column<Vendor>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'contactPerson', header: 'Contact Person', render: (r) => r.contactPerson ?? '—' },
    { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
    { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
    { key: 'gstNumber', header: 'GST No.', render: (r) => r.gstNumber ?? '—' },
    { key: 'active', header: 'Status', render: (r) => <Badge value={r.active ? 'ACTIVE' : 'INACTIVE'} /> },
  ];

  return (
    <div>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={search}
        searchPlaceholder="Search vendors..."
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        headerActions={
          can('PURCHASE_ORDER', 'add') && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> Add Vendor
            </button>
          )
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {can('PURCHASE_ORDER', 'edit') && (
              <button className="btn-ghost p-1.5" onClick={() => openEdit(row)}>
                <Pencil size={15} />
              </button>
            )}
            {can('PURCHASE_ORDER', 'delete') && (
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteTarget(row)}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Vendor' : 'Add Vendor'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              Save
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Vendor Name *</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Address</label>
            <textarea className="input" rows={2} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">GST Number</label>
              <input className="input" value={form.gstNumber} onChange={(e) => setForm((f) => ({ ...f, gstNumber: e.target.value }))} />
            </div>
            <div>
              <label className="label">Contact Person</label>
              <input className="input" value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
            Active
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Vendor"
        message={`Delete "${deleteTarget?.name}"? Vendors with linked Purchase Orders cannot be deleted — set them Inactive instead.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
