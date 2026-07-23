import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, UserCheck2, Download, FileUp, FileDown, Mail, MessageCircle, History } from 'lucide-react';
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
import { CANDIDATE_STATUSES, INTERVIEW_STAGES } from '../utils/candidateConstants';
import { BulkImportModal } from '../components/recruitment/BulkImportModal';
import { BulkSendModal } from '../components/recruitment/BulkSendModal';
import { CommunicationStats } from '../components/recruitment/CommunicationStats';
import { TemplateManager } from '../components/recruitment/TemplateManager';
import { CommunicationHistory } from '../components/recruitment/CommunicationHistory';
import { CandidateTimelineModal } from '../components/recruitment/CandidateTimelineModal';

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
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [exportingCandidates, setExportingCandidates] = useState(false);
  const [activeTab, setActiveTab] = useState<'candidates' | 'communication'>('candidates');
  const [commSubTab, setCommSubTab] = useState<'history' | 'templates'>('history');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [bulkWhatsappOpen, setBulkWhatsappOpen] = useState(false);
  const [timelineCandidate, setTimelineCandidate] = useState<Candidate | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };
  const canSend = can('RECRUITMENT', 'approve');

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

  const pageIds = (data?.data ?? []).map((c) => c.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => (allPageSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]));
  };

  const handleExportCandidates = async () => {
    setExportingCandidates(true);
    try {
      const full = await recruitmentApi.list({ page: 1, pageSize: 5000, search, ...filters });
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Candidates');
      sheet.columns = [
        { header: 'Candidate Name', key: 'candidateName', width: 24 },
        { header: 'Contact Number', key: 'contactNumber', width: 18 },
        { header: 'Email', key: 'email', width: 26 },
        { header: 'Qualification', key: 'qualification', width: 22 },
        { header: 'Experience', key: 'experience', width: 14 },
        { header: 'Designation', key: 'designation', width: 18 },
        { header: 'Assigned Project', key: 'project', width: 18 },
        { header: 'Forays Interview Status', key: 'forays', width: 20 },
        { header: 'Client Interview Status', key: 'client', width: 20 },
        { header: 'Candidate Status', key: 'status', width: 18 },
        { header: 'Resume URL', key: 'resumeUrl', width: 30 },
        { header: 'Remarks', key: 'remarks', width: 24 },
      ];
      sheet.getRow(1).font = { bold: true };
      sheet.addRows(
        (full.data as Candidate[]).map((c) => ({
          candidateName: c.candidateName,
          contactNumber: c.contactNumber,
          email: c.email ?? '',
          qualification: c.qualification ?? '',
          experience: c.experience ?? '',
          designation: c.designation?.name ?? '',
          project: c.project?.projectName ?? '',
          forays: c.foraysInterviewStatus,
          client: c.clientInterviewStatus,
          status: c.status,
          resumeUrl: c.resumeUrl ?? '',
          remarks: c.remarks ?? '',
        }))
      );
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Candidates_Export.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not export candidates');
    } finally {
      setExportingCandidates(false);
    }
  };

  const columns: Column<Candidate>[] = [
    {
      key: 'select',
      header: '',
      className: 'w-8',
      render: (r) => (
        <input type="checkbox" className="rounded" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} />
      ),
    },
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
      <PageHeader title="Recruitment" description="Candidate pipeline for assigned projects" />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['candidates', 'communication'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-4 py-2 text-sm font-medium capitalize ${
              activeTab === tab
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {tab === 'candidates' ? 'Candidates' : 'Bulk Communication'}
          </button>
        ))}
      </div>

      {activeTab === 'candidates' && (
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        search={search}
        searchPlaceholder="Search candidates..."
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        headerActions={
          <>
            {can('RECRUITMENT', 'add') && (
              <button
                className="btn-secondary"
                disabled={downloadingTemplate}
                onClick={async () => {
                  setDownloadingTemplate(true);
                  try {
                    const { downloadCandidateTemplate } = await import('../utils/excelImport');
                    await downloadCandidateTemplate(projectOptions.map((p) => p.label));
                  } catch {
                    toast.error('Could not generate the template file');
                  } finally {
                    setDownloadingTemplate(false);
                  }
                }}
              >
                <Download size={16} /> Download Template
              </button>
            )}
            {can('RECRUITMENT', 'add') && (
              <button className="btn-secondary" onClick={() => setBulkImportOpen(true)}>
                <FileUp size={16} /> Import Excel
              </button>
            )}
            <button className="btn-secondary" disabled={exportingCandidates} onClick={handleExportCandidates}>
              <FileDown size={16} /> Export Excel
            </button>
            {canSend && (
              <button
                className="btn-secondary"
                disabled={selectedIds.length === 0}
                title={selectedIds.length === 0 ? 'Select candidates first' : ''}
                onClick={() => setBulkEmailOpen(true)}
              >
                <Mail size={16} /> Bulk Email
              </button>
            )}
            {canSend && (
              <button
                className="btn-secondary"
                disabled={selectedIds.length === 0}
                title={selectedIds.length === 0 ? 'Select candidates first' : ''}
                onClick={() => setBulkWhatsappOpen(true)}
              >
                <MessageCircle size={16} /> Bulk WhatsApp
              </button>
            )}
            {can('RECRUITMENT', 'add') && (
              <button className="btn-primary" onClick={openCreate}>
                <Plus size={16} /> Add Candidate
              </button>
            )}
          </>
        }
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
              <input type="checkbox" className="rounded" checked={allPageSelected} onChange={toggleSelectAllOnPage} />
              Select All
            </label>
            {selectedIds.length > 0 && (
              <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                {selectedIds.length} selected
                <button className="ml-1.5 underline" onClick={() => setSelectedIds([])}>
                  Clear
                </button>
              </span>
            )}
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
            <button title="Communication Timeline" className="btn-ghost p-1.5" onClick={() => setTimelineCandidate(row)}>
              <History size={15} />
            </button>
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
      )}

      {activeTab === 'communication' && (
        <div>
          <CommunicationStats />
          <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
            {(['history', 'templates'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setCommSubTab(tab)}
                className={`border-b-2 px-4 py-2 text-sm font-medium capitalize ${
                  commSubTab === tab
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {tab === 'history' ? 'Communication History' : 'Message Templates'}
              </button>
            ))}
          </div>
          {commSubTab === 'history' ? <CommunicationHistory /> : <TemplateManager />}
        </div>
      )}

      {activeTab === 'candidates' && (
      <>
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

      <BulkImportModal
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        projectOptions={projectOptions}
        designationOptions={designationOptions}
        onImported={() => queryClient.invalidateQueries({ queryKey: ['recruitment'] })}
      />
      </>
      )}

      <BulkSendModal
        open={bulkEmailOpen}
        onClose={() => setBulkEmailOpen(false)}
        channel="EMAIL"
        selectedCandidateIds={selectedIds}
        onSent={() => setSelectedIds([])}
      />
      <BulkSendModal
        open={bulkWhatsappOpen}
        onClose={() => setBulkWhatsappOpen(false)}
        channel="WHATSAPP"
        selectedCandidateIds={selectedIds}
        onSent={() => setSelectedIds([])}
      />
      <CandidateTimelineModal
        candidateId={timelineCandidate?.id ?? null}
        candidateName={timelineCandidate?.candidateName}
        onClose={() => setTimelineCandidate(null)}
      />
    </div>
  );
}
