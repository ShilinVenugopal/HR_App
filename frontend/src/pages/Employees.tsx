import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Employee, employeesApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { useDepartmentOptions, useDesignationOptions, useEmployeeOptions, useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';

const STATUSES = ['ACTIVE', 'INACTIVE', 'RESIGNED', 'TERMINATED'];

const emptyForm = {
  name: '',
  employeeId: '',
  contactNumber: '',
  email: '',
  dateOfBirth: '',
  departmentId: '',
  designationId: '',
  projectId: '',
  joiningDate: '',
  reportingManagerId: '',
  status: 'ACTIVE',
};

export default function Employees() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();
  const designationOptions = useDesignationOptions();
  const departmentOptions = useDepartmentOptions();
  const employeeOptions = useEmployeeOptions();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ projectId: '', departmentId: '', status: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['employees', page, search, filters],
    queryFn: () => employeesApi.list({ page, pageSize: 10, search, ...filters }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditing(employee);
    setForm({
      name: employee.name,
      employeeId: employee.employeeId ?? '',
      contactNumber: employee.contactNumber ?? '',
      email: employee.email ?? '',
      dateOfBirth: employee.dateOfBirth?.slice(0, 10) ?? '',
      departmentId: employee.departmentId ?? '',
      designationId: employee.designationId ?? '',
      projectId: employee.projectId,
      joiningDate: employee.joiningDate?.slice(0, 10) ?? '',
      reportingManagerId: employee.reportingManagerId ?? '',
      status: employee.status,
    });
    setErrors({});
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        employeeId: form.employeeId || null,
        email: form.email || null,
        dateOfBirth: form.dateOfBirth || null,
        departmentId: form.departmentId || null,
        designationId: form.designationId || null,
        joiningDate: form.joiningDate || null,
        reportingManagerId: form.reportingManagerId || null,
      };
      if (editing) return employeesApi.update(editing.id, payload);
      return employeesApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Employee updated' : 'Employee created successfully');
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => employeesApi.remove(id),
    onSuccess: () => {
      toast.success('Employee deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Employee name is required';
    if (!form.projectId) next.projectId = 'Project is required — every employee must belong to exactly one project';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      toast.error('Please fill the mandatory fields');
      return;
    }
    saveMutation.mutate();
  };

  const columns: Column<Employee>[] = [
    { key: 'employeeCode', header: 'Employee Code', render: (r) => <span className="font-mono text-xs">{r.employeeCode}</span> },
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'project', header: 'Project', render: (r) => r.project?.projectName ?? '—' },
    { key: 'department', header: 'Department', render: (r) => r.department?.name ?? '—' },
    { key: 'designation', header: 'Designation', render: (r) => r.designation?.name ?? '—' },
    { key: 'joiningDate', header: 'Joining Date', render: (r) => (r.joiningDate ? new Date(r.joiningDate).toLocaleDateString() : '—') },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Employees" description="Employee master, one project per employee" />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={search}
        searchPlaceholder="Search employees..."
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        headerActions={
          can('EMPLOYEES', 'add') && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> Add Employee
            </button>
          )
        }
        filters={
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto" value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">All Projects</option>
              {projectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className="input w-auto" value={filters.departmentId} onChange={(e) => setFilters((f) => ({ ...f, departmentId: e.target.value }))}>
              <option value="">All Departments</option>
              {departmentOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className="input w-auto" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {can('EMPLOYEES', 'edit') && (
              <button className="btn-ghost p-1.5" onClick={() => openEdit(row)}>
                <Pencil size={15} />
              </button>
            )}
            {can('EMPLOYEES', 'delete') && (
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
        title={editing ? 'Edit Employee' : 'Add Employee'}
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saveMutation.isPending} onClick={handleSubmit}>
              Save Employee
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Full Name *</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>
          <div>
            <label className="label">Employee ID</label>
            <input className="input" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} />
          </div>
          <div>
            <label className="label">Contact Number</label>
            <input className="input" value={form.contactNumber} onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Date of Birth</label>
            <input type="date" className="input" value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} />
          </div>
          <div>
            <label className="label">Project *</label>
            <select className="input" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">Select</option>
              {projectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {errors.projectId && <p className="mt-1 text-xs text-red-500">{errors.projectId}</p>}
          </div>
          <div>
            <label className="label">Department</label>
            <select className="input" value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}>
              <option value="">Select</option>
              {departmentOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Designation</label>
            <select className="input" value={form.designationId} onChange={(e) => setForm((f) => ({ ...f, designationId: e.target.value }))}>
              <option value="">Select</option>
              {designationOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Joining Date</label>
            <input type="date" className="input" value={form.joiningDate} onChange={(e) => setForm((f) => ({ ...f, joiningDate: e.target.value }))} />
          </div>
          <div>
            <label className="label">Reporting Manager</label>
            <select className="input" value={form.reportingManagerId} onChange={(e) => setForm((f) => ({ ...f, reportingManagerId: e.target.value }))}>
              <option value="">Select</option>
              {employeeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Employee"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
