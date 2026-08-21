import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileDown, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { Asset, InventoryUnit, assetsApi } from '../api/modules';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable, Column, SortState } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { useAuth } from '../context/AuthContext';
import { useCostCodeOptions, useProjectOptions } from '../hooks/useLookups';
import { apiErrorMessage } from '../api/client';
import { AssetsBulkImportModal } from '../components/assets/AssetsBulkImportModal';
import { UNIT_OPTIONS, downloadAssetTemplate, exportAssetsExcel, exportAssetsPdf, unitLabel } from '../utils/assetsExcel';

const emptyForm = {
  projectId: '',
  costCodeId: '',
  itemDescription: '',
  unit: 'NOS',
  workingQuantity: '0',
  nonWorkingQuantity: '0',
  remarks: '',
  date: new Date().toISOString().slice(0, 10),
};

const emptyFilters = { projectId: '', costCodeId: '', date: '' };

/// "Sr No" is the record's position in the current sort/page — computed
/// client-side, never stored (see the Asset Prisma model's header comment).
type AssetRow = Asset & { srNo: number };

export default function Assets() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();
  const costCodeOptions = useCostCodeOptions();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [sort, setSort] = useState<SortState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ['assets', page, pageSize, search, filters, sort],
    queryFn: () =>
      assetsApi.list({
        page,
        pageSize,
        search,
        ...filters,
        ...(sort ? { sortBy: sort.key, sortOrder: sort.dir } : {}),
      }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['assets'] });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (item: AssetRow) => {
    setEditing(item);
    setForm({
      projectId: item.projectId,
      costCodeId: item.costCodeId,
      itemDescription: item.itemDescription,
      unit: item.unit,
      workingQuantity: String(item.workingQuantity),
      nonWorkingQuantity: String(item.nonWorkingQuantity),
      remarks: item.remarks ?? '',
      date: item.date.slice(0, 10),
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.projectId) next.projectId = 'Project is required';
    if (!form.costCodeId) next.costCodeId = 'Cost Code is required';
    if (!form.itemDescription.trim()) next.itemDescription = 'Item Description is required';
    if (!form.workingQuantity.trim()) next.workingQuantity = 'Working Quantity is required';
    else if (!Number.isFinite(Number(form.workingQuantity)) || Number(form.workingQuantity) < 0) next.workingQuantity = 'Must be 0 or more';
    if (!form.nonWorkingQuantity.trim()) next.nonWorkingQuantity = 'Non-working Quantity is required';
    else if (!Number.isFinite(Number(form.nonWorkingQuantity)) || Number(form.nonWorkingQuantity) < 0) next.nonWorkingQuantity = 'Must be 0 or more';
    if (!form.date) next.date = 'Date is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        projectId: form.projectId,
        costCodeId: form.costCodeId,
        itemDescription: form.itemDescription.trim(),
        unit: form.unit as InventoryUnit,
        workingQuantity: Number(form.workingQuantity) || 0,
        nonWorkingQuantity: Number(form.nonWorkingQuantity) || 0,
        remarks: form.remarks.trim() || undefined,
        date: form.date,
      };
      return editing ? assetsApi.update(editing.id, payload) : assetsApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Asset updated' : 'Asset created');
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
    setFilters(emptyFilters);
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const full = await assetsApi.list({
        page: 1,
        pageSize: 5000,
        search,
        ...filters,
        ...(sort ? { sortBy: sort.key, sortOrder: sort.dir } : {}),
      });
      await exportAssetsExcel(full.data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const full = await assetsApi.list({
        page: 1,
        pageSize: 5000,
        search,
        ...filters,
        ...(sort ? { sortBy: sort.key, sortOrder: sort.dir } : {}),
      });
      await exportAssetsPdf(full.data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<AssetRow>[] = [
    { key: 'srNo', header: 'Sr No', sortable: true, render: (r) => r.srNo },
    { key: 'costCode', header: 'Cost Code', sortable: true, render: (r) => (r.costCode ? `${r.costCode.code} — ${r.costCode.name}` : '—') },
    { key: 'itemDescription', header: 'Item Description', sortable: true, render: (r) => <span className="font-medium">{r.itemDescription}</span> },
    { key: 'unit', header: 'Unit', sortable: true, render: (r) => unitLabel(r.unit) },
    { key: 'workingQuantity', header: 'Working Qty', sortable: true, render: (r) => Number(r.workingQuantity).toLocaleString('en-IN') },
    { key: 'nonWorkingQuantity', header: 'Non-working Qty', sortable: true, render: (r) => Number(r.nonWorkingQuantity).toLocaleString('en-IN') },
    { key: 'remarks', header: 'Remarks', render: (r) => r.remarks ?? '—' },
    { key: 'date', header: 'Date', sortable: true, render: (r) => new Date(r.date).toLocaleDateString() },
    { key: 'project', header: 'Project', sortable: true, render: (r) => r.project?.projectName ?? '—' },
    { key: 'createdBy', header: 'Created By', render: (r) => r.createdBy?.name ?? '—' },
    { key: 'createdAt', header: 'Created Date', sortable: true, render: (r) => new Date(r.createdAt).toLocaleDateString() },
  ];

  const srNoStart = ((data?.meta?.page ?? 1) - 1) * pageSize;
  const rows: AssetRow[] = (data?.data ?? []).map((r, i) => ({ ...r, srNo: srNoStart + i + 1 }));

  return (
    <div>
      <PageHeader
        title="Assets"
        description="Project-wise register of tools, machinery, and other physical assets"
        actions={
          <>
            <button
              className="btn-secondary"
              onClick={() => downloadAssetTemplate({ projects: projectOptions.map((p) => ({ id: p.value, name: p.label })), costCodes: costCodeOptions.map((c) => ({ id: c.value, code: c.code, name: c.name })) })}
            >
              <Download size={16} /> Download Excel Template
            </button>
            {can('ASSETS', 'add') && (
              <button className="btn-secondary" onClick={() => setBulkImportOpen(true)}>
                <Upload size={16} /> Upload Excel
              </button>
            )}
            <button className="btn-secondary" disabled={exporting} onClick={handleExportExcel}>
              <FileDown size={16} /> Export Excel
            </button>
            <button className="btn-secondary" disabled={exporting} onClick={handleExportPdf}>
              <FileDown size={16} /> Export PDF
            </button>
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        showPageNumbers
        search={searchInput}
        searchPlaceholder="Search item description..."
        onSearchChange={setSearchInput}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        filters={
          <>
            <select
              className="input w-auto"
              value={filters.projectId}
              onChange={(e) => {
                setFilters((f) => ({ ...f, projectId: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All Projects</option>
              {projectOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <div className="w-56">
              <SearchableSelect
                options={[{ value: '', label: 'All Cost Codes' }, ...costCodeOptions]}
                value={filters.costCodeId}
                onChange={(value) => {
                  setFilters((f) => ({ ...f, costCodeId: value }));
                  setPage(1);
                }}
                placeholder="All Cost Codes"
                searchPlaceholder="Search code or description..."
              />
            </div>
            <input
              type="date"
              className="input w-auto"
              value={filters.date}
              onChange={(e) => {
                setFilters((f) => ({ ...f, date: e.target.value }));
                setPage(1);
              }}
              title="Filter by date"
            />
            <button className="btn-secondary" onClick={clearFilters}>
              Clear Filters
            </button>
          </>
        }
        headerActions={
          can('ASSETS', 'add') && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> Add Asset
            </button>
          )
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {can('ASSETS', 'edit') && (
              <button className="btn-ghost p-1.5" onClick={() => openEdit(row)}>
                <Pencil size={15} />
              </button>
            )}
            {can('ASSETS', 'delete') && (
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
        title={editing ? 'Edit Asset' : 'Add Asset'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saveMutation.isPending} onClick={handleSubmit}>
              Save
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Project *</label>
              <select className="input" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
                <option value="">Select project...</option>
                {projectOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              {errors.projectId && <p className="mt-1 text-xs text-red-500">{errors.projectId}</p>}
            </div>
            <div>
              <label className="label">Cost Code *</label>
              <SearchableSelect
                options={costCodeOptions}
                value={form.costCodeId}
                onChange={(value) => setForm((f) => ({ ...f, costCodeId: value }))}
                placeholder="Select cost code..."
                searchPlaceholder="Search code or description..."
              />
              {errors.costCodeId && <p className="mt-1 text-xs text-red-500">{errors.costCodeId}</p>}
            </div>
          </div>

          <div>
            <label className="label">Item Description *</label>
            <input className="input" value={form.itemDescription} onChange={(e) => setForm((f) => ({ ...f, itemDescription: e.target.value }))} />
            {errors.itemDescription && <p className="mt-1 text-xs text-red-500">{errors.itemDescription}</p>}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Unit *</label>
              <select className="input" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
                {UNIT_OPTIONS.map((u) => (
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
                className="input"
                value={form.nonWorkingQuantity}
                onChange={(e) => setForm((f) => ({ ...f, nonWorkingQuantity: e.target.value }))}
              />
              {errors.nonWorkingQuantity && <p className="mt-1 text-xs text-red-500">{errors.nonWorkingQuantity}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              {errors.date && <p className="mt-1 text-xs text-red-500">{errors.date}</p>}
            </div>
            <div>
              <label className="label">Remarks</label>
              <input className="input" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>
        </div>
      </Modal>

      <AssetsBulkImportModal
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        projectOptions={projectOptions}
        costCodeOptions={costCodeOptions}
        onImported={invalidate}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Asset"
        message={`Delete "${deleteTarget?.itemDescription}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
