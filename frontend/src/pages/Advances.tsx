import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, X, CircleDollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { Advance, advancesApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { useEmployeeOptions, useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';

const emptyForm = { employeeId: '', type: 'ADVANCE', amount: 0, reason: '', installments: 1 };
const emptyRecovery = { month: new Date().getMonth() + 1, year: new Date().getFullYear(), amount: 0 };

export default function Advances() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();
  const employeeOptions = useEmployeeOptions();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ projectId: '', type: '', status: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [recoveryTarget, setRecoveryTarget] = useState<Advance | null>(null);
  const [recoveryForm, setRecoveryForm] = useState(emptyRecovery);

  const { data, isLoading } = useQuery({
    queryKey: ['advances', page, filters],
    queryFn: () => advancesApi.list({ page, pageSize: 10, ...filters }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['advances'] });

  const createMutation = useMutation({
    mutationFn: () => advancesApi.create(form as any),
    onSuccess: () => {
      toast.success('Request submitted');
      setModalOpen(false);
      setForm(emptyForm);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => advancesApi.approve(id),
    onSuccess: () => {
      toast.success('Approved');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => advancesApi.reject(id),
    onSuccess: () => {
      toast.success('Rejected');
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const recoveryMutation = useMutation({
    mutationFn: () => advancesApi.addRecovery(recoveryTarget!.id, recoveryForm),
    onSuccess: () => {
      toast.success('Recovery recorded');
      setRecoveryTarget(null);
      setRecoveryForm(emptyRecovery);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const columns: Column<Advance>[] = [
    { key: 'employee', header: 'Employee', render: (r) => r.employee?.name ?? '—' },
    { key: 'project', header: 'Project', render: (r) => r.project?.projectName ?? '—' },
    { key: 'type', header: 'Type', render: (r) => r.type },
    { key: 'amount', header: 'Amount', render: (r) => `₹${Number(r.amount).toLocaleString('en-IN')}` },
    { key: 'recovered', header: 'Recovered', render: (r) => `₹${Number(r.recoveredAmount).toLocaleString('en-IN')}` },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Advances"
        description="Employee advances, loans and recoveries"
        actions={
          can('ADVANCES', 'add') && (
            <button className="btn-primary" onClick={() => setModalOpen(true)}>
              <Plus size={16} /> New Request
            </button>
          )
        }
      />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
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
            <select className="input w-auto" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
              <option value="">All Types</option>
              <option value="ADVANCE">Advance</option>
              <option value="LOAN">Loan</option>
            </select>
            <select className="input w-auto" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {can('ADVANCES', 'approve') && row.status === 'PENDING' && (
              <>
                <button className="btn-ghost p-1.5 text-emerald-600" onClick={() => approveMutation.mutate(row.id)}>
                  <Check size={15} />
                </button>
                <button className="btn-ghost p-1.5 text-red-500" onClick={() => rejectMutation.mutate(row.id)}>
                  <X size={15} />
                </button>
              </>
            )}
            {can('ADVANCES', 'edit') && row.status === 'APPROVED' && (
              <button className="btn-ghost p-1.5" title="Record Recovery" onClick={() => setRecoveryTarget(row)}>
                <CircleDollarSign size={15} />
              </button>
            )}
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Advance / Loan Request"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              Submit
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
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="ADVANCE">Advance</option>
              <option value="LOAN">Loan</option>
            </select>
          </div>
          <div>
            <label className="label">Amount *</label>
            <input type="number" className="input" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Installments</label>
            <input type="number" min={1} className="input" value={form.installments} onChange={(e) => setForm((f) => ({ ...f, installments: Number(e.target.value) }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Reason</label>
            <textarea className="input" rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(recoveryTarget)}
        onClose={() => setRecoveryTarget(null)}
        title={`Record Recovery — ${recoveryTarget?.employee?.name ?? ''}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setRecoveryTarget(null)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={recoveryMutation.isPending} onClick={() => recoveryMutation.mutate()}>
              Record
            </button>
          </>
        }
      >
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Month</label>
            <input type="number" min={1} max={12} className="input" value={recoveryForm.month} onChange={(e) => setRecoveryForm((f) => ({ ...f, month: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Year</label>
            <input type="number" className="input" value={recoveryForm.year} onChange={(e) => setRecoveryForm((f) => ({ ...f, year: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Amount</label>
            <input type="number" className="input" value={recoveryForm.amount} onChange={(e) => setRecoveryForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
          </div>
        </div>
        {recoveryTarget && (
          <p className="mt-3 text-xs text-slate-500">
            Outstanding balance: ₹{(Number(recoveryTarget.amount) - Number(recoveryTarget.recoveredAmount)).toLocaleString('en-IN')}
          </p>
        )}
      </Modal>
    </div>
  );
}
