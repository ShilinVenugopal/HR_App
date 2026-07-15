import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, UserCheck2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Candidate, recruitmentApi, employeesApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { useDesignationOptions, useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';

const CANDIDATE_STATUSES = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED',
  'SELECTED',
  'REJECTED',
  'OFFER_RELEASED',
  'JOINED',
  'CANCELLED',
];
const INTERVIEW_STAGES = ['NOT_STARTED', 'SCHEDULED', 'COMPLETED', 'PASSED', 'FAILED', 'ON_HOLD'];

const emptyForm = {
  candidateName: '',
  contactNumber: '',
  dateOfBirth: '',
  qualification: '',
  experience: '',
  designationId: '',
  email: '',
  projectId: '',
  resumeUrl: '',
  foraysInterviewStatus: 'NOT_STARTED',
  clientInterviewStatus: 'NOT_STARTED',
  remarks: '',
  status: 'APPLIED',
};

export default function Recruitment() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();
  const designationOptions = useDesignationOptions();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ projectId: '', designationId: '', status: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Candidate | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['recruitment', page, search, filters],
    queryFn: () => recruitmentApi.list({ page, pageSize: 10, search, ...filters }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (candidate: Candidate) => {
    setEditing(candidate);
    setForm({
      candidateName: candidate.candidateName,
      contactNumber: candidate.contactNumber,
      dateOfBirth: candidate.dateOfBirth?.slice(0, 10) ?? '',
      qualification: candidate.qualification ?? '',
      experience: candidate.experience ?? '',
      designationId: candidate.designationId ?? '',
      email: candidate.email ?? '',
      projectId: candidate.projectId ?? '',
      resumeUrl: candidate.resumeUrl ?? '',
      foraysInterviewStatus: candidate.foraysInterviewStatus,
      clientInterviewStatus: candidate.clientInterviewStatus,
      remarks: candidate.remarks ?? '',
      status: candidate.status,
    });
    setErrors({});
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        dateOfBirth: form.dateOfBirth || null,
        designationId: form.designationId || null,
        projectId: form.projectId || null,
        email: form.email || null,
      };
      if (editing) return recruitmentApi.update(editing.id, payload);
      return recruitmentApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Candidate updated' : 'Candidate added successfully');
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['recruitment'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => recruitmentApi.remove(id),
    onSuccess: () => {
      toast.success('Candidate deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['recruitment'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const convertMutation = useMutation({
    mutationFn: (candidateId: string) => employeesApi.convertCandidate(candidateId),
    onSuccess: () => {
      toast.success('Candidate converted to Employee');
      queryClient.invalidateQueries({ queryKey: ['recruitment'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.candidateName.trim()) next.candidateName = 'Candidate Name is required';
    if (!form.contactNumber.trim()) next.contactNumber = 'Contact Number is required';
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

  const columns: Column<Candidate>[] = [
    { key: 'candidateName', header: 'Candidate', render: (r) => <span className="font-medium">{r.candidateName}</span> },
    { key: 'contactNumber', header: 'Contact', render: (r) => r.contactNumber },
    { key: 'project', header: 'Project', render: (r) => r.project?.projectName ?? '—' },
    { key: 'designation', header: 'Designation', render: (r) => r.designation?.name ?? '—' },
    { key: 'experience', header: 'Experience', render: (r) => r.experience ?? '—' },
    { key: 'forays', header: 'Forays Interview', render: (r) => <Badge value={r.foraysInterviewStatus} /> },
    { key: 'client', header: 'Client Interview', render: (r) => <Badge value={r.clientInterviewStatus} /> },
    { key: 'status', header: 'Status', render: (r) => <Badge value={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Recruitment"
        description="Candidate pipeline for assigned projects"
        actions={
          can('RECRUITMENT', 'add') && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> Add Candidate
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
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
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
              {CANDIDATE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {can('EMPLOYEES', 'add') && !row.employee && (
              <button
                title="Convert to Employee"
                className="btn-ghost p-1.5"
                onClick={() => convertMutation.mutate(row.id)}
              >
                <UserCheck2 size={15} />
              </button>
            )}
            {can('RECRUITMENT', 'edit') && (
              <button className="btn-ghost p-1.5" onClick={() => openEdit(row)}>
                <Pencil size={15} />
              </button>
            )}
            {can('RECRUITMENT', 'delete') && (
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
        title={editing ? 'Edit Candidate' : 'Add Candidate'}
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saveMutation.isPending} onClick={handleSubmit}>
              Save Candidate
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Candidate Name *</label>
            <input className="input" value={form.candidateName} onChange={(e) => setForm((f) => ({ ...f, candidateName: e.target.value }))} />
            {errors.candidateName && <p className="mt-1 text-xs text-red-500">{errors.candidateName}</p>}
          </div>
          <div>
            <label className="label">Contact Number *</label>
            <input className="input" value={form.contactNumber} onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))} />
            {errors.contactNumber && <p className="mt-1 text-xs text-red-500">{errors.contactNumber}</p>}
          </div>
          <div>
            <label className="label">Date of Birth</label>
            <input type="date" className="input" value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Qualification</label>
            <input className="input" value={form.qualification} onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))} />
          </div>
          <div>
            <label className="label">Experience</label>
            <input className="input" placeholder="e.g. 3 years" value={form.experience} onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))} />
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
            <label className="label">Assigned Project</label>
            <select className="input" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">Select</option>
              {projectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Forays Interview Status</label>
            <select className="input" value={form.foraysInterviewStatus} onChange={(e) => setForm((f) => ({ ...f, foraysInterviewStatus: e.target.value }))}>
              {INTERVIEW_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Client Interview Status</label>
            <select className="input" value={form.clientInterviewStatus} onChange={(e) => setForm((f) => ({ ...f, clientInterviewStatus: e.target.value }))}>
              {INTERVIEW_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Candidate Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {CANDIDATE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Resume URL</label>
            <input className="input" placeholder="https://..." value={form.resumeUrl} onChange={(e) => setForm((f) => ({ ...f, resumeUrl: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Remarks</label>
            <textarea className="input" rows={2} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Candidate"
        message={`Are you sure you want to delete "${deleteTarget?.candidateName}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
