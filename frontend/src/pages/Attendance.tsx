import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, X, Lock, Unlock, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { AttendanceRecord, attendanceApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { useEmployeeOptions, useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';

const SHIFTS = ['DAY', 'NIGHT', 'GENERAL'];
const STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEK_OFF'];

const emptyForm = {
  employeeId: '',
  date: new Date().toISOString().slice(0, 10),
  shift: 'GENERAL',
  inTime: '',
  outTime: '',
  status: 'PRESENT',
  overtimeHours: 0,
  remarks: '',
};

export default function Attendance() {
  const { can, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();
  const employeeOptions = useEmployeeOptions();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ projectId: '', status: '', approvalStatus: '', dateFrom: '', dateTo: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRecord | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', page, filters],
    queryFn: () => attendanceApi.list({ page, pageSize: 10, ...filters }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['attendance'] });

  const createMutation = useMutation({
    mutationFn: () => attendanceApi.create(form as any),
    onSuccess: () => {
      toast.success('Attendance marked successfully');
      setModalOpen(false);
      setForm(emptyForm);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => attendanceApi.approve(id),
    onSuccess: () => {
      toast.success('Attendance approved');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => attendanceApi.reject(id),
    onSuccess: () => {
      toast.success('Attendance rejected');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const lockMutation = useMutation({
    mutationFn: (id: string) => attendanceApi.lock(id),
    onSuccess: () => {
      toast.success('Attendance locked');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const unlockMutation = useMutation({
    mutationFn: (id: string) => attendanceApi.unlock(id),
    onSuccess: () => {
      toast.success('Attendance unlocked');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => attendanceApi.remove(id),
    onSuccess: () => {
      toast.success('Attendance deleted');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: Column<AttendanceRecord>[] = [
    { key: 'date', header: 'Date', render: (r) => new Date(r.date).toLocaleDateString() },
    { key: 'employee', header: 'Employee', render: (r) => r.employee?.name ?? '—' },
    { key: 'project', header: 'Project', render: (r) => r.project?.projectName ?? '—' },
    { key: 'shift', header: 'Shift', render: (r) => r.shift },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
    { key: 'ot', header: 'OT (hrs)', render: (r) => Number(r.overtimeHours) },
    { key: 'approval', header: 'Approval', render: (r) => <Badge value={r.approvalStatus} /> },
    { key: 'locked', header: 'Locked', render: (r) => (r.isLocked ? <Lock size={14} className="text-slate-400" /> : '') },
  ];

  return (
    <div>
      <PageHeader title="Attendance" description="Daily attendance, shift, overtime and approvals" />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        headerActions={
          can('ATTENDANCE', 'add') && (
            <button className="btn-primary" onClick={() => setModalOpen(true)}>
              <Plus size={16} /> Mark Attendance
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
            <select className="input w-auto" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select className="input w-auto" value={filters.approvalStatus} onChange={(e) => setFilters((f) => ({ ...f, approvalStatus: e.target.value }))}>
              <option value="">All Approval Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <input type="date" className="input w-auto" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
            <input type="date" className="input w-auto" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          </div>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {can('ATTENDANCE', 'approve') && row.approvalStatus === 'PENDING' && (
              <>
                <button className="btn-ghost p-1.5 text-emerald-600" onClick={() => approveMutation.mutate(row.id)}>
                  <Check size={15} />
                </button>
                <button className="btn-ghost p-1.5 text-red-500" onClick={() => rejectMutation.mutate(row.id)}>
                  <X size={15} />
                </button>
              </>
            )}
            {isSuperAdmin &&
              (row.isLocked ? (
                <button className="btn-ghost p-1.5" title="Unlock" onClick={() => unlockMutation.mutate(row.id)}>
                  <Unlock size={15} />
                </button>
              ) : (
                <button className="btn-ghost p-1.5" title="Lock" onClick={() => lockMutation.mutate(row.id)}>
                  <Lock size={15} />
                </button>
              ))}
            {can('ATTENDANCE', 'delete') && !row.isLocked && (
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
        title="Mark Attendance"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              Save
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Employee *</label>
            <select className="input" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
              <option value="">Select employee</option>
              {employeeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date *</label>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label className="label">Shift</label>
            <select className="input" value={form.shift} onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))}>
              {SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">In Time</label>
            <input type="time" className="input" value={form.inTime} onChange={(e) => setForm((f) => ({ ...f, inTime: e.target.value }))} />
          </div>
          <div>
            <label className="label">Out Time</label>
            <input type="time" className="input" value={form.outTime} onChange={(e) => setForm((f) => ({ ...f, outTime: e.target.value }))} />
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
          <div>
            <label className="label">Overtime Hours</label>
            <input
              type="number"
              min={0}
              step={0.5}
              className="input"
              value={form.overtimeHours}
              onChange={(e) => setForm((f) => ({ ...f, overtimeHours: Number(e.target.value) }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Remarks</label>
            <textarea className="input" rows={2} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Attendance"
        message="Are you sure you want to delete this attendance record?"
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
