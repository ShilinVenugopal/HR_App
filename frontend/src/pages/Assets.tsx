import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownAZ, ArrowUpAZ, Download, FileDown, FileText, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Asset, AssetUnit, assetsApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';
import { AssetBulkImportModal } from '../components/assets/AssetBulkImportModal';
import { ASSET_UNITS, downloadAssetTemplate, exportAssetsExcel, exportAssetsPdf, unitLabel } from '../utils/assetsExcel';

const SORT_OPTIONS = [
  { value: 'srNo', label: 'Sr No' },
  { value: 'costCode', label: 'Cost Code' },
  { value: 'itemDescription', label: 'Item Description' },
  { value: 'unit', label: 'Unit' },
  { value: 'workingQuantity', label: 'Working Quantity' },
  { value: 'nonWorkingQuantity', label: 'Non-working Quantity' },
  { value: 'date', label: 'Date' },
  { value: 'project', label: 'Project' },
  { value: 'createdAt', label: 'Created Date' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const emptyForm = {
  costCode: '',
  itemDescription: '',
  unit: 'NOS' as AssetUnit,
  workingQuantity: '',
  nonWorkingQuantity: '',
  remarks: '',
  date: '',
  projectId: '',
};

export default function Assets() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ projectId: '', costCode: '', date: '' });
  const [sort, setSort] = useState<{ sortBy: string; sortOrder: 'asc' | 'desc' }>({ sortBy: 'srNo', sortOrder: 'asc' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ['assets', page, pageSize, search, filters, sort],
    queryFn: () => assetsApi.list({ page, pageSize, search, sortBy: sort.sortBy, sortOrder: sort.sortOrder, ...filters }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['assets'] });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setEditing(asset);
    setForm({
      costCode: asset.costCode,
      itemDescription: asset.itemDescription,
      unit: asset.unit,
      workingQuantity: String(asset.workingQuantity),
      nonWorkingQuantity: String(asset.nonWorkingQuantity),
      remarks: asset.remarks ?? '',
      date: asset.date.slice(0, 10),
      projectId: asset.projectId,
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.costCode.trim()) next.costCode = 'Cost Code is required';
    if (!form.itemDescription.trim()) next.itemDescription = 'Item Description is required';
    if (!form.unit) next.unit = 'Unit is required';
    if (form.workingQuantity === '' || Number.isNaN(Number(form.workingQuantity))) next.workingQuantity = 'Working Quantity must be numeric';
    else if (Number(form.workingQuantity) < 0) next.workingQuantity = 'Cannot be negative';
    if (form.nonWorkingQuantity === '' || Number.isNaN(Number(form.nonWorkingQuantity))) next.nonWorkingQuantity = 'Non-working Quantity must be numeric';
    else if (Number(form.nonWorkingQuantity) < 0) next.nonWorkingQuantity = 'Cannot be negative';
    if (!form.date) next.date = 'Date is required';
    if (!form.projectId) next.projectId = 'Project is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        costCode: form.costCode.trim(),
        itemDescription: form.itemDescription.trim(),
        unit: form.unit,
        workingQuantity: Number(form.workingQuantity),
        nonWorkingQuantity: Number(form.nonWorkingQuantity),
        remarks: form.remarks.trim() || null,
        date: form.date,
        projectId: form.projectId,
      };
      if (editing) return assetsApi.update(editing.id, payload);
      return assetsApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Asset updated' : 'Asset added successfully');
      setModalOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assetsApi.remove(id),
    onSuccess: () => {
      toast.success('Asset deleted');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleSubmit = () => {
    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    saveMutation.mutate();
  };

  const clearFilters = () => {
    setFilters({ projectId: '', costCode: '', date: '' });
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(filters.projectId || filters.costCode || filters.date || search);

  const handleExport = async (kind: 'excel' | 'pdf') => {
    setExporting(kind);
    try {
      const full = await assetsApi.list({ page: 1, pageSize: 5000, search, sortBy: sort.sortBy, sortOrder: sort.sortOrder, ...filters });
      if (kind === 'excel') await exportAssetsExcel(full.data);
      else await exportAssetsPdf(full.data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(null);
    }
  };

  const columns: Column<Asset>[] = [
    { key: 'srNo', header: 'Sr No', render: (r) => r.srNo },
    { key: 'costCode', header: 'Cost Code', render: (r) => <span className="font-mono text-xs">{r.costCode}</span> },
    { key: 'itemDescription', header: 'Item Description', render: (r) => <span className="font-medium">{r.itemDescription}</span> },
    { key: 'unit', header: 'Unit', render: (r) => unitLabel(r.unit) },
    { key: 'workingQuantity', header: 'Working Qty', render: (r) => r.workingQuantity },
    { key: 'nonWorkingQuantity', header: 'Non-working Qty', render: (r) => r.nonWorkingQuantity },
    { key: 'remarks', header: 'Remarks', render: (r) => r.remarks || '—' },
    { key: 'date', header: 'Date', render: (r) => new Date(r.date).toLocaleDateString() },
    { key: 'project', header: 'Project', render: (r) => r.project?.projectName ?? '—' },
    { key: 'createdBy', header: 'Created By', render: (r) => r.createdBy?.name ?? '—' },
    { key: 'createdAt', header: 'Created Date', render: (r) => new Date(r.createdAt).toLocaleString() },
  ];

  return (
    <div>
      <PageHeader title="Assets" description="Project-wise asset management" />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        showPageNumbers
        search={searchInput}
        searchPlaceholder="Search item description..."
        onSearchChange={setSearchInput}
        headerActions={
          <>
            <button className="btn-secondary" onClick={() => downloadAssetTemplate(projectOptions.map((p) => p.label))}>
              <Download size={15} /> Download Template
            </button>
            {can('ASSETS', 'add') && (
              <button className="btn-secondary" onClick={() => setBulkImportOpen(true)}>
                <Upload size={15} /> Upload Excel
              </button>
            )}
            <button className="btn-secondary" disabled={exporting === 'excel'} onClick={() => handleExport('excel')}>
              <FileDown size={15} /> Export Excel
            </button>
            <button className="btn-secondary" disabled={exporting === 'pdf'} onClick={() => handleExport('pdf')}>
              <FileText size={15} /> Export PDF
            </button>
            {can('ASSETS', 'add') && (
              <button className="btn-primary" onClick={openCreate}>
                <Plus size={16} /> Add Asset
              </button>
            )}
          </>
        }
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto" value={filters.projectId} onChange={(e) => { setFilters((f) => ({ ...f, projectId: e.target.value })); setPage(1); }}>
              <option value="">All Projects</option>
              {projectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              className="input w-auto"
              placeholder="Cost Code"
              value={filters.costCode}
              onChange={(e) => { setFilters((f) => ({ ...f, costCode: e.target.value })); setPage(1); }}
            />
            <input
              type="date"
              className="input w-auto"
              value={filters.date}
              onChange={(e) => { setFilters((f) => ({ ...f, date: e.target.value })); setPage(1); }}
            />
            <select
              className="input w-auto"
              value={sort.sortBy}
              onChange={(e) => setSort((s) => ({ ...s, sortBy: e.target.value }))}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Sort: {o.label}
                </option>
              ))}
            </select>
            <button
              className="btn-secondary px-2"
              title={sort.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              onClick={() => setSort((s) => ({ ...s, sortOrder: s.sortOrder === 'asc' ? 'desc' : 'asc' }))}
            >
              {sort.sortOrder === 'asc' ? <ArrowUpAZ size={15} /> : <ArrowDownAZ size={15} />}
            </button>
            {hasActiveFilters && (
              <button className="btn-ghost" onClick={clearFilters}>
                <X size={14} /> Clear Filters
              </button>
            )}
          </div>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {can('ASSETS', 'edit') && (
              <button className="btn-ghost p-1.5" title="Edit" onClick={() => openEdit(row)}>
                <Pencil size={15} />
              </button>
            )}
            {can('ASSETS', 'delete') && (
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
        title={editing ? 'Edit Asset' : 'Add Asset'}
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saveMutation.isPending} onClick={handleSubmit}>
              Save Asset
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Cost Code *</label>
            <input className="input" value={form.costCode} onChange={(e) => setForm((f) => ({ ...f, costCode: e.target.value }))} />
            {errors.costCode && <p className="mt-1 text-xs text-red-500">{errors.costCode}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="label">Item Description *</label>
            <input className="input" value={form.itemDescription} onChange={(e) => setForm((f) => ({ ...f, itemDescription: e.target.value }))} />
            {errors.itemDescription && <p className="mt-1 text-xs text-red-500">{errors.itemDescription}</p>}
          </div>
          <div>
            <label className="label">Unit *</label>
            <select className="input" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as AssetUnit }))}>
              {ASSET_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Working Quantity *</label>
            <input
              type="number"
              min="0"
              step="any"
              className="input"
              value={form.workingQuantity}
              onChange={(e) => setForm((f) => ({ ...f, workingQuantity: e.target.value }))}
            />
            {errors.workingQuantity && <p className="mt-1 text-xs text-red-500">{errors.workingQuantity}</p>}
          </div>
          <div>
            <label className="label">Non-working Quantity *</label>
            <input
              type="number"
              min="0"
              step="any"
              className="input"
              value={form.nonWorkingQuantity}
              onChange={(e) => setForm((f) => ({ ...f, nonWorkingQuantity: e.target.value }))}
            />
            {errors.nonWorkingQuantity && <p className="mt-1 text-xs text-red-500">{errors.nonWorkingQuantity}</p>}
          </div>
          <div>
            <label className="label">Date *</label>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            {errors.date && <p className="mt-1 text-xs text-red-500">{errors.date}</p>}
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
          <div className="sm:col-span-3">
            <label className="label">Remarks</label>
            <textarea className="input" rows={2} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <AssetBulkImportModal open={bulkImportOpen} onClose={() => setBulkImportOpen(false)} projectOptions={projectOptions} onImported={invalidate} />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Asset"
        message={`Are you sure you want to delete "${deleteTarget?.itemDescription}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
