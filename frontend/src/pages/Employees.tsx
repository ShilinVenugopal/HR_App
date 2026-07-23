import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Columns3, Download, Eye, FileDown, Pencil, Plus, Trash2, Upload } from 'lucide-react';
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
import { EmployeeBulkImportModal } from '../components/employees/EmployeeBulkImportModal';
import { ColumnCustomizerModal } from '../components/employees/ColumnCustomizerModal';
import { EmployeeProfileModal } from '../components/employees/EmployeeProfileModal';
import { DEFAULT_VISIBLE_COLUMNS, EMPLOYEE_FIELDS, EmployeeFieldKey, STATUS_OPTIONS, downloadEmployeeTemplate, exportEmployeesExcel, statusLabel } from '../utils/employeeExcel';

const CONTACT_RE = /^\d{10}$/;
const AADHAAR_RE = /^\d{12}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const BANK_ACCOUNT_RE = /^\d+$/;

const emptyForm = {
  employeeCode: '',
  name: '',
  fatherName: '',
  contactNumber: '',
  dateOfBirth: '',
  joiningDate: '',
  departmentId: '',
  designationId: '',
  projectId: '',
  reportingManagerId: '',
  panNumber: '',
  aadhaarNumber: '',
  passportNumber: '',
  pfNumber: '',
  uanNumber: '',
  esicNumber: '',
  bankAccountNumber: '',
  bankIfscCode: '',
  bankName: '',
  bankAccountName: '',
  address: '',
  status: 'ACTIVE',
};

function useColumnPreference(userId: string | undefined) {
  const storageKey = `hr_app_employee_columns_${userId ?? 'anon'}`;
  const [visibleColumns, setVisibleColumns] = useState<EmployeeFieldKey[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved) as EmployeeFieldKey[];
    } catch {
      // ignore malformed saved preference, fall back to default
    }
    return DEFAULT_VISIBLE_COLUMNS;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(visibleColumns));
  }, [visibleColumns, storageKey]);

  return [visibleColumns, setVisibleColumns] as const;
}

export default function Employees() {
  const { can, session } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();
  const designationOptions = useDesignationOptions();
  const departmentOptions = useDepartmentOptions();
  const employeeOptions = useEmployeeOptions();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ projectId: '', departmentId: '', designationId: '', status: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [profileTarget, setProfileTarget] = useState<Employee | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [columnCustomizerOpen, setColumnCustomizerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [visibleColumns, setVisibleColumns] = useColumnPreference(session?.user.id);

  // Instant search that doesn't refetch on every single keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ['employees', page, search, filters],
    queryFn: () => employeesApi.list({ page, pageSize: 10, search, ...filters }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['employees'] });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditing(employee);
    setForm({
      employeeCode: employee.employeeCode,
      name: employee.name,
      fatherName: employee.fatherName ?? '',
      contactNumber: employee.contactNumber,
      dateOfBirth: employee.dateOfBirth?.slice(0, 10) ?? '',
      joiningDate: employee.joiningDate?.slice(0, 10) ?? '',
      departmentId: employee.departmentId ?? '',
      designationId: employee.designationId ?? '',
      projectId: employee.projectId,
      reportingManagerId: employee.reportingManagerId ?? '',
      panNumber: employee.panNumber ?? '',
      aadhaarNumber: employee.aadhaarNumber ?? '',
      passportNumber: employee.passportNumber ?? '',
      pfNumber: employee.pfNumber ?? '',
      uanNumber: employee.uanNumber ?? '',
      esicNumber: employee.esicNumber ?? '',
      bankAccountNumber: employee.bankAccountNumber ?? '',
      bankIfscCode: employee.bankIfscCode ?? '',
      bankName: employee.bankName ?? '',
      bankAccountName: employee.bankAccountName ?? '',
      address: employee.address ?? '',
      status: employee.status,
    });
    setErrors({});
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        fatherName: form.fatherName || null,
        dateOfBirth: form.dateOfBirth || null,
        joiningDate: form.joiningDate || null,
        departmentId: form.departmentId || null,
        designationId: form.designationId || null,
        reportingManagerId: form.reportingManagerId || null,
        panNumber: form.panNumber ? form.panNumber.toUpperCase() : null,
        aadhaarNumber: form.aadhaarNumber || null,
        passportNumber: form.passportNumber || null,
        pfNumber: form.pfNumber || null,
        uanNumber: form.uanNumber || null,
        esicNumber: form.esicNumber || null,
        bankAccountNumber: form.bankAccountNumber || null,
        bankIfscCode: form.bankIfscCode ? form.bankIfscCode.toUpperCase() : null,
        bankName: form.bankName || null,
        bankAccountName: form.bankAccountName || null,
        address: form.address || null,
      };
      if (editing) return employeesApi.update(editing.id, payload);
      return employeesApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Employee updated' : 'Employee created successfully');
      setModalOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => employeesApi.remove(id),
    onSuccess: () => {
      toast.success('Employee deleted');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.employeeCode.trim()) next.employeeCode = 'Employee Code is required';
    if (!form.name.trim()) next.name = 'Employee Name is required';
    if (!CONTACT_RE.test(form.contactNumber.trim())) next.contactNumber = 'Contact Number must be exactly 10 digits';
    if (!form.projectId) next.projectId = 'Project is required — every employee must belong to exactly one project';
    if (form.dateOfBirth && new Date(form.dateOfBirth).getTime() > Date.now()) next.dateOfBirth = 'Cannot be a future date';
    if (form.joiningDate && new Date(form.joiningDate).getTime() > Date.now()) next.joiningDate = 'Cannot be a future date';
    if (form.panNumber && !PAN_RE.test(form.panNumber.trim())) next.panNumber = 'Format: ABCDE1234F';
    if (form.aadhaarNumber && !AADHAAR_RE.test(form.aadhaarNumber.trim())) next.aadhaarNumber = 'Must be exactly 12 digits';
    if (form.bankIfscCode && !IFSC_RE.test(form.bankIfscCode.trim())) next.bankIfscCode = 'Must be a valid 11-character IFSC code';
    if (form.bankAccountNumber && !BANK_ACCOUNT_RE.test(form.bankAccountNumber.trim())) next.bankAccountNumber = 'Digits only';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    saveMutation.mutate();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const full = await employeesApi.list({ page: 1, pageSize: 5000, search, ...filters });
      await exportEmployeesExcel(full.data, visibleColumns);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const cellRenderers: Partial<Record<EmployeeFieldKey, (r: Employee) => ReactNode>> = useMemo(
    () => ({
      employeeCode: (r) => <span className="font-mono text-xs">{r.employeeCode}</span>,
      name: (r) => <span className="font-medium">{r.name}</span>,
      project: (r) => r.project?.projectName ?? '—',
      department: (r) => r.department?.name ?? '—',
      designation: (r) => r.designation?.name ?? '—',
      dateOfBirth: (r) => (r.dateOfBirth ? new Date(r.dateOfBirth).toLocaleDateString() : '—'),
      joiningDate: (r) => (r.joiningDate ? new Date(r.joiningDate).toLocaleDateString() : '—'),
      status: (r) => <Badge value={r.status} label={statusLabel(r.status)} />,
    }),
    []
  );

  const fallbackRender = (key: EmployeeFieldKey) => (r: Employee) => (r as unknown as Record<string, string | null>)[key] || '—';

  const columns: Column<Employee>[] = visibleColumns
    .map((key) => EMPLOYEE_FIELDS.find((f) => f.key === key))
    .filter((f): f is (typeof EMPLOYEE_FIELDS)[number] => Boolean(f))
    .map((f) => ({ key: f.key, header: f.label, render: cellRenderers[f.key] ?? fallbackRender(f.key) }));

  return (
    <div>
      <PageHeader title="Employees" description="Complete employee master database" />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={searchInput}
        searchPlaceholder="Search by name, code, contact or Aadhaar..."
        onSearchChange={setSearchInput}
        headerActions={
          <>
            <button className="btn-secondary" onClick={() => downloadEmployeeTemplate({ projects: projectOptions.map((p) => ({ id: p.value, name: p.label })), departments: departmentOptions.map((d) => ({ id: d.value, name: d.label })), designations: designationOptions.map((d) => ({ id: d.value, name: d.label })) })}>
              <Download size={15} /> Download Template
            </button>
            {can('EMPLOYEES', 'add') && (
              <button className="btn-secondary" onClick={() => setBulkImportOpen(true)}>
                <Upload size={15} /> Import Excel
              </button>
            )}
            <button className="btn-secondary" disabled={exporting} onClick={handleExport}>
              <FileDown size={15} /> Export Excel
            </button>
            <button className="btn-secondary" onClick={() => setColumnCustomizerOpen(true)}>
              <Columns3 size={15} /> Customize Columns
            </button>
            {can('EMPLOYEES', 'add') && (
              <button className="btn-primary" onClick={openCreate}>
                <Plus size={16} /> Add Employee
              </button>
            )}
          </>
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
            <select className="input w-auto" value={filters.designationId} onChange={(e) => setFilters((f) => ({ ...f, designationId: e.target.value }))}>
              <option value="">All Designations</option>
              {designationOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className="input w-auto" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <button className="btn-ghost p-1.5" title="View" onClick={() => setProfileTarget(row)}>
              <Eye size={15} />
            </button>
            {can('EMPLOYEES', 'edit') && (
              <button className="btn-ghost p-1.5" title="Edit" onClick={() => openEdit(row)}>
                <Pencil size={15} />
              </button>
            )}
            {can('EMPLOYEES', 'delete') && (
              <button className="btn-ghost p-1.5 text-red-500" title="Delete" onClick={() => setDeleteTarget(row)}>
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
        size="xl"
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
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Personal Details</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Employee Code *</label>
                <input className="input" value={form.employeeCode} onChange={(e) => setForm((f) => ({ ...f, employeeCode: e.target.value }))} />
                {errors.employeeCode && <p className="mt-1 text-xs text-red-500">{errors.employeeCode}</p>}
              </div>
              <div>
                <label className="label">Employee Name *</label>
                <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>
              <div>
                <label className="label">Father's Name</label>
                <input className="input" value={form.fatherName} onChange={(e) => setForm((f) => ({ ...f, fatherName: e.target.value }))} />
              </div>
              <div>
                <label className="label">Contact Number *</label>
                <input className="input" value={form.contactNumber} onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))} />
                {errors.contactNumber && <p className="mt-1 text-xs text-red-500">{errors.contactNumber}</p>}
              </div>
              <div>
                <label className="label">Date of Birth</label>
                <input type="date" className="input" value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} />
                {errors.dateOfBirth && <p className="mt-1 text-xs text-red-500">{errors.dateOfBirth}</p>}
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Employment Details</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                <label className="label">Date of Joining</label>
                <input type="date" className="input" value={form.joiningDate} onChange={(e) => setForm((f) => ({ ...f, joiningDate: e.target.value }))} />
                {errors.joiningDate && <p className="mt-1 text-xs text-red-500">{errors.joiningDate}</p>}
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
                <label className="label">Status *</label>
                <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Government IDs</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">PAN Card Number</label>
                <input className="input" placeholder="ABCDE1234F" value={form.panNumber} onChange={(e) => setForm((f) => ({ ...f, panNumber: e.target.value }))} />
                {errors.panNumber && <p className="mt-1 text-xs text-red-500">{errors.panNumber}</p>}
              </div>
              <div>
                <label className="label">Aadhaar Card Number</label>
                <input className="input" value={form.aadhaarNumber} onChange={(e) => setForm((f) => ({ ...f, aadhaarNumber: e.target.value }))} />
                {errors.aadhaarNumber && <p className="mt-1 text-xs text-red-500">{errors.aadhaarNumber}</p>}
              </div>
              <div>
                <label className="label">Passport Number</label>
                <input className="input" value={form.passportNumber} onChange={(e) => setForm((f) => ({ ...f, passportNumber: e.target.value }))} />
              </div>
              <div>
                <label className="label">PF Number</label>
                <input className="input" value={form.pfNumber} onChange={(e) => setForm((f) => ({ ...f, pfNumber: e.target.value }))} />
              </div>
              <div>
                <label className="label">UAN Number</label>
                <input className="input" value={form.uanNumber} onChange={(e) => setForm((f) => ({ ...f, uanNumber: e.target.value }))} />
              </div>
              <div>
                <label className="label">ESIC Number</label>
                <input className="input" value={form.esicNumber} onChange={(e) => setForm((f) => ({ ...f, esicNumber: e.target.value }))} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Bank Details</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Bank Account Number</label>
                <input className="input" value={form.bankAccountNumber} onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))} />
                {errors.bankAccountNumber && <p className="mt-1 text-xs text-red-500">{errors.bankAccountNumber}</p>}
              </div>
              <div>
                <label className="label">Bank IFSC Code</label>
                <input className="input" value={form.bankIfscCode} onChange={(e) => setForm((f) => ({ ...f, bankIfscCode: e.target.value }))} />
                {errors.bankIfscCode && <p className="mt-1 text-xs text-red-500">{errors.bankIfscCode}</p>}
              </div>
              <div>
                <label className="label">Bank Name</label>
                <input className="input" value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} />
              </div>
              <div>
                <label className="label">Bank Account Name</label>
                <input className="input" value={form.bankAccountName} onChange={(e) => setForm((f) => ({ ...f, bankAccountName: e.target.value }))} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Address</h3>
            <textarea className="input" rows={3} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <EmployeeProfileModal
        employee={profileTarget}
        onClose={() => setProfileTarget(null)}
        onEdit={openEdit}
        onDelete={(employee) => setDeleteTarget(employee)}
      />

      <EmployeeBulkImportModal
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        projectOptions={projectOptions}
        departmentOptions={departmentOptions}
        designationOptions={designationOptions}
        onImported={invalidate}
      />

      <ColumnCustomizerModal
        open={columnCustomizerOpen}
        onClose={() => setColumnCustomizerOpen(false)}
        visibleKeys={visibleColumns}
        onChange={setVisibleColumns}
      />

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
