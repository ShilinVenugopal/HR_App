import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Copy, FileDown, Lock, Plus, Printer, Send, Trash2, Unlock as UnlockIcon } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/common/Badge';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useCostCodeOptions, useDepartmentOptions, useProjectOptions } from '../hooks/useLookups';
import { InventoryUnit, PrItemInput, purchaseRequisitionsApi } from '../api/modules';
import { apiErrorMessage } from '../api/client';
import { UNIT_OPTIONS, unitLabel } from '../utils/inventoryExcel';
import { PR_CATEGORIES } from '../utils/purchaseRequisitionCategories';
import { exportPurchaseRequisitionExcel } from '../utils/purchaseRequisitionExcel';
import { SubmitForApprovalModal } from '../components/procurement/SubmitForApprovalModal';
import { DecisionModal, DecisionAction } from '../components/procurement/DecisionModal';

interface DraftItem {
  key: string;
  materialName: string;
  unit: InventoryUnit;
  totalReqQty: string;
  make: string;
  modelNo: string;
  qtyAvailableAtSite: string;
  remarks: string;
}

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `row-${keyCounter}`;
}

function emptyDraftItem(): DraftItem {
  return { key: newKey(), materialName: '', unit: 'NOS', totalReqQty: '', make: '', modelNo: '', qtyAvailableAtSite: '0', remarks: '' };
}

function emptyItemsByCategory(): Record<string, DraftItem[]> {
  return Object.fromEntries(PR_CATEGORIES.map((c) => [c.code, [] as DraftItem[]]));
}

export default function PurchaseRequisitionDetail() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { can, session } = useAuth();
  const queryClient = useQueryClient();

  const projectOptions = useProjectOptions();
  const costCodeOptions = useCostCodeOptions();
  const departmentOptions = useDepartmentOptions();

  const [projectId, setProjectId] = useState('');
  const [prNumber, setPrNumber] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [siteInchargeName, setSiteInchargeName] = useState('');
  const [storeInchargeName, setStoreInchargeName] = useState('');
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, DraftItem[]>>(emptyItemsByCategory);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ['pr', id],
    queryFn: () => purchaseRequisitionsApi.get(id!),
    enabled: !isNew,
  });

  const pr = existing?.data;

  useEffect(() => {
    if (!pr) return;
    setProjectId(pr.projectId);
    setPrNumber(pr.prNumber ?? '');
    setDepartmentId(pr.departmentId ?? '');
    setSiteInchargeName(pr.siteInchargeName ?? '');
    setStoreInchargeName(pr.storeInchargeName ?? '');
    const grouped = emptyItemsByCategory();
    for (const item of pr.items) {
      const code = item.costCode?.code;
      if (code && grouped[code]) {
        grouped[code].push({
          key: newKey(),
          materialName: item.materialName,
          unit: item.unit,
          totalReqQty: String(item.totalReqQty),
          make: item.make ?? '',
          modelNo: item.modelNo ?? '',
          qtyAvailableAtSite: String(item.qtyAvailableAtSite),
          remarks: item.remarks ?? '',
        });
      }
    }
    setItemsByCategory(grouped);
  }, [pr]);

  const isEditable = isNew || (pr && (pr.status === 'DRAFT' || pr.status === 'RETURNED'));
  const isCurrentApprover = pr && (pr.currentApproverId === session?.user.id || session?.user.role === 'SUPER_ADMIN');
  const canDecide = pr && pr.status === 'PENDING_APPROVAL' && isCurrentApprover && can('PURCHASE_REQUISITION', 'approve');

  const addRow = (code: string) => setItemsByCategory((prev) => ({ ...prev, [code]: [...prev[code], emptyDraftItem()] }));
  const duplicateRow = (code: string, key: string) =>
    setItemsByCategory((prev) => {
      const rows = prev[code];
      const idx = rows.findIndex((r) => r.key === key);
      if (idx === -1) return prev;
      const copy = { ...rows[idx], key: newKey() };
      const next = [...rows];
      next.splice(idx + 1, 0, copy);
      return { ...prev, [code]: next };
    });
  const deleteRow = (code: string, key: string) => setItemsByCategory((prev) => ({ ...prev, [code]: prev[code].filter((r) => r.key !== key) }));
  const updateRow = (code: string, key: string, patch: Partial<DraftItem>) =>
    setItemsByCategory((prev) => ({ ...prev, [code]: prev[code].map((r) => (r.key === key ? { ...r, ...patch } : r)) }));

  const buildItemsPayload = (): PrItemInput[] => {
    const payload: PrItemInput[] = [];
    for (const cat of PR_CATEGORIES) {
      const costCode = costCodeOptions.find((c) => c.code === cat.code);
      if (!costCode) continue;
      for (const row of itemsByCategory[cat.code]) {
        if (!row.materialName.trim()) continue;
        payload.push({
          costCodeId: costCode.value,
          materialName: row.materialName.trim(),
          unit: row.unit,
          totalReqQty: Number(row.totalReqQty) || 0,
          make: row.make.trim() || undefined,
          modelNo: row.modelNo.trim() || undefined,
          qtyAvailableAtSite: Number(row.qtyAvailableAtSite) || 0,
          remarks: row.remarks.trim() || undefined,
        });
      }
    }
    return payload;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const items = buildItemsPayload();
      if (!items.length) throw new Error('Add at least one item before saving');
      const payload = {
        projectId,
        prNumber: prNumber || undefined,
        departmentId: departmentId || undefined,
        siteInchargeName: siteInchargeName || undefined,
        storeInchargeName: storeInchargeName || undefined,
        items,
      };
      return isNew ? purchaseRequisitionsApi.create(payload) : purchaseRequisitionsApi.update(id!, payload);
    },
    onSuccess: (res) => {
      toast.success('Saved as Draft');
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions'] });
      if (isNew) navigate(`/purchase-requisitions/${res.data.id}`, { replace: true });
      else queryClient.invalidateQueries({ queryKey: ['pr', id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const submitMutation = useMutation({
    mutationFn: (approverId: string) => purchaseRequisitionsApi.submit(id!, approverId),
    onSuccess: () => {
      toast.success('Submitted for approval');
      setSubmitModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['pr', id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const decisionMutation = useMutation({
    mutationFn: (vars: { action: DecisionAction; comments: string }) => {
      if (vars.action === 'APPROVE') return purchaseRequisitionsApi.approve(id!, vars.comments || undefined);
      if (vars.action === 'REJECT') return purchaseRequisitionsApi.reject(id!, vars.comments);
      return purchaseRequisitionsApi.returnToRequester(id!, vars.comments);
    },
    onSuccess: (_res, vars) => {
      toast.success(vars.action === 'APPROVE' ? 'Approved' : vars.action === 'REJECT' ? 'Rejected' : 'Returned to requester');
      setDecisionAction(null);
      queryClient.invalidateQueries({ queryKey: ['pr', id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const unlockMutation = useMutation({
    mutationFn: () => purchaseRequisitionsApi.unlock(id!),
    onSuccess: () => {
      toast.success('Unlocked — back to Draft');
      queryClient.invalidateQueries({ queryKey: ['pr', id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => purchaseRequisitionsApi.remove(id!),
    onSuccess: () => {
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions'] });
      navigate('/purchase-requisitions');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const selectedProject = projectOptions.find((p) => p.value === projectId);
  const totalItemCount = Object.values(itemsByCategory).reduce((sum, rows) => sum + rows.filter((r) => r.materialName.trim()).length, 0);

  if (!isNew && isLoading) {
    return <p className="text-sm text-slate-400">Loading...</p>;
  }

  return (
    <div>
      <PageHeader
        title={isNew ? 'New Purchase Requisition' : `Purchase Requisition ${pr?.requestNumber ?? ''}`}
        description={pr ? `PR No. ${pr.prNumber ?? '—'}` : 'Fill in project, items and site details, then save as Draft'}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button className="btn-secondary" onClick={() => navigate('/purchase-requisitions')}>
              <ArrowLeft size={16} /> Back
            </button>
            {pr && <Badge value={pr.status} />}
            {!isNew && pr && (
              <>
                <button className="btn-secondary" onClick={() => window.print()}>
                  <Printer size={16} /> Print
                </button>
                <button className="btn-secondary" onClick={() => exportPurchaseRequisitionExcel(pr)}>
                  <FileDown size={16} /> Export Excel
                </button>
              </>
            )}
            {isEditable && can('PURCHASE_REQUISITION', isNew ? 'add' : 'edit') && (
              <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                Save Draft
              </button>
            )}
            {!isNew && isEditable && can('PURCHASE_REQUISITION', 'edit') && (
              <button className="btn-primary" onClick={() => setSubmitModalOpen(true)}>
                <Send size={16} /> Proceed for Approval
              </button>
            )}
            {!isNew && pr?.status === 'DRAFT' && can('PURCHASE_REQUISITION', 'delete') && (
              <button className="btn-secondary text-red-600" onClick={() => setDeleteConfirmOpen(true)}>
                <Trash2 size={16} /> Delete
              </button>
            )}
            {canDecide && (
              <>
                <button className="btn-primary" onClick={() => setDecisionAction('APPROVE')}>
                  Approve
                </button>
                <button className="btn-secondary" onClick={() => setDecisionAction('RETURN')}>
                  Return
                </button>
                <button className="btn-danger" onClick={() => setDecisionAction('REJECT')}>
                  Reject
                </button>
              </>
            )}
            {!isNew && pr?.status === 'APPROVED' && session?.user.role === 'SUPER_ADMIN' && (
              <button className="btn-secondary" onClick={() => unlockMutation.mutate()}>
                <UnlockIcon size={16} /> Unlock
              </button>
            )}
          </div>
        }
      />

      <div className="card p-6">
        {/* Static header block matching PUR-01.xlsx */}
        <div className="mb-6 flex items-start justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <p className="text-lg font-bold">FORAYS INNOVATIONS PVT LTD</p>
            <p className="mt-1 text-xl font-bold">PURCHASE REQUISITION</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>Doc No. : PUR-F-06</p>
            <p>Issue No. : 01  Rev : 00</p>
            <p>Date : {pr ? new Date(pr.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <label className="label">Project (Name of Site) *</label>
            {isEditable ? (
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!isNew}>
                <option value="">Select project...</option>
                {projectOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="font-medium">{pr?.project?.projectName ?? '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Project No.</label>
            {/* Read-only, auto-populated from the Project master by projectId —
                never editable here and never falls back to the project name.
                pr.project.projectNumber (live join data) is authoritative once
                a PR is saved; selectedProject covers the create-new case where
                pr doesn't exist yet, both keyed off the same projectId. */}
            {!projectId ? (
              <p className="font-medium">—</p>
            ) : (pr?.project?.projectNumber ?? selectedProject?.projectNumber) ? (
              <p className="font-medium">{pr?.project?.projectNumber ?? selectedProject?.projectNumber}</p>
            ) : (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Project Number is not assigned for this project. Please update the project master.
              </p>
            )}
          </div>
          <div>
            <label className="label">Purchase Req. No.</label>
            {isEditable ? (
              <input className="input" value={prNumber} onChange={(e) => setPrNumber(e.target.value)} placeholder="Manually entered site reference" />
            ) : (
              <p className="font-medium">{pr?.prNumber ?? '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Request Number (system)</label>
            <p className="font-mono text-sm">{pr?.requestNumber ?? '(assigned on save)'}</p>
          </div>
          <div>
            <label className="label">Department</label>
            {isEditable ? (
              <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">Select department...</option>
                {departmentOptions.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="font-medium">{pr?.department?.name ?? '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Requester</label>
            <p className="font-medium">{pr?.requester?.name ?? session?.user.name ?? '—'}</p>
          </div>
          <div>
            <label className="label">Name of Site Incharge</label>
            {isEditable ? (
              <input
                className="input"
                value={siteInchargeName}
                onChange={(e) => setSiteInchargeName(e.target.value)}
                placeholder="Person recommending the request on-site"
              />
            ) : (
              <p className="font-medium">{pr?.siteInchargeName ?? '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Name of Store Incharge</label>
            {isEditable ? (
              <input
                className="input"
                value={storeInchargeName}
                onChange={(e) => setStoreInchargeName(e.target.value)}
                placeholder="Person raising/requesting the item(s)"
              />
            ) : (
              <p className="font-medium">{pr?.storeInchargeName ?? '—'}</p>
            )}
          </div>
        </div>

        {/* Item sections — 8 fixed categories matching PUR-01.xlsx */}
        <div className="space-y-6">
          {PR_CATEGORIES.map((cat) => {
            const rows = isEditable ? itemsByCategory[cat.code] ?? [] : pr?.items.filter((it) => it.costCode?.code === cat.code) ?? [];
            if (!isEditable && rows.length === 0) return null;
            return (
              <div key={cat.code} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between bg-slate-100 px-3 py-2 text-sm font-semibold dark:bg-slate-800">
                  <span>
                    {cat.letter}. {cat.code} — {cat.label}
                  </span>
                  {isEditable && (
                    <button className="btn-ghost px-2 py-1 text-xs print:hidden" onClick={() => addRow(cat.code)}>
                      <Plus size={14} /> Add Row
                    </button>
                  )}
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="px-2 py-1.5">Material Name</th>
                      <th className="px-2 py-1.5">Unit</th>
                      <th className="px-2 py-1.5">Total Req. Qty</th>
                      <th className="px-2 py-1.5">Make</th>
                      <th className="px-2 py-1.5">Model No.</th>
                      <th className="px-2 py-1.5">Qty Available at Site</th>
                      <th className="px-2 py-1.5">Bal. Qty Req.</th>
                      <th className="px-2 py-1.5">Remarks</th>
                      {isEditable && <th className="px-2 py-1.5 print:hidden">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {isEditable
                      ? (rows as DraftItem[]).map((row) => {
                          const bal = Math.max(0, (Number(row.totalReqQty) || 0) - (Number(row.qtyAvailableAtSite) || 0));
                          return (
                            <tr key={row.key}>
                              <td className="px-1 py-1">
                                <input
                                  className="input py-1 text-xs"
                                  value={row.materialName}
                                  onChange={(e) => updateRow(cat.code, row.key, { materialName: e.target.value })}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <select
                                  className="input py-1 text-xs"
                                  value={row.unit}
                                  onChange={(e) => updateRow(cat.code, row.key, { unit: e.target.value as InventoryUnit })}
                                >
                                  {UNIT_OPTIONS.map((u) => (
                                    <option key={u.value} value={u.value}>
                                      {u.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  type="number"
                                  min="0"
                                  className="input py-1 text-xs"
                                  value={row.totalReqQty}
                                  onChange={(e) => updateRow(cat.code, row.key, { totalReqQty: e.target.value })}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input className="input py-1 text-xs" value={row.make} onChange={(e) => updateRow(cat.code, row.key, { make: e.target.value })} />
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  className="input py-1 text-xs"
                                  value={row.modelNo}
                                  onChange={(e) => updateRow(cat.code, row.key, { modelNo: e.target.value })}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  type="number"
                                  min="0"
                                  className="input py-1 text-xs"
                                  value={row.qtyAvailableAtSite}
                                  onChange={(e) => updateRow(cat.code, row.key, { qtyAvailableAtSite: e.target.value })}
                                />
                              </td>
                              <td className="px-2 py-1 text-slate-400">{bal}</td>
                              <td className="px-1 py-1">
                                <input
                                  className="input py-1 text-xs"
                                  value={row.remarks}
                                  onChange={(e) => updateRow(cat.code, row.key, { remarks: e.target.value })}
                                />
                              </td>
                              <td className="px-1 py-1 print:hidden">
                                <div className="flex gap-1">
                                  <button className="btn-ghost p-1" onClick={() => duplicateRow(cat.code, row.key)} title="Duplicate">
                                    <Copy size={13} />
                                  </button>
                                  <button className="btn-ghost p-1 text-red-500" onClick={() => deleteRow(cat.code, row.key)} title="Delete">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      : (rows as NonNullable<typeof pr>['items']).map((item) => (
                          <tr key={item.id}>
                            <td className="px-2 py-1.5">{item.materialName}</td>
                            <td className="px-2 py-1.5">{unitLabel(item.unit)}</td>
                            <td className="px-2 py-1.5">{Number(item.totalReqQty)}</td>
                            <td className="px-2 py-1.5">{item.make ?? '—'}</td>
                            <td className="px-2 py-1.5">{item.modelNo ?? '—'}</td>
                            <td className="px-2 py-1.5">{Number(item.qtyAvailableAtSite)}</td>
                            <td className="px-2 py-1.5">{Number(item.balQtyReq)}</td>
                            <td className="px-2 py-1.5">{item.remarks ?? '—'}</td>
                          </tr>
                        ))}
                    {isEditable && rows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-2 py-2 text-center text-slate-400">
                          No items in this category
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
          {isEditable && totalItemCount === 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">Add at least one item to a category above before saving.</p>
          )}
        </div>

        {/* Signature blocks */}
        {!isNew && pr && (
          <div className="mt-10 grid grid-cols-3 gap-6 border-t border-slate-200 pt-6 text-sm dark:border-slate-800">
            <div>
              <p className="font-semibold">REQUESTED BY (STORE INCHARGE)</p>
              <p className="mt-6">Name: {pr.storeInchargeName ?? '—'}</p>
              <p>Date: {new Date(pr.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="font-semibold">RECOMMENDED BY (SITE INCHARGE)</p>
              <p className="mt-6">Name: {pr.siteInchargeName ?? '—'}</p>
              <p>Date: —</p>
            </div>
            <div>
              <p className="font-semibold">APPROVED BY (GM / PM)</p>
              <p className="mt-6">Name: {pr.currentApprover?.name ?? '—'}</p>
              <p>Date: {pr.status === 'APPROVED' && pr.decidedAt ? new Date(pr.decidedAt).toLocaleDateString() : '—'}</p>
            </div>
          </div>
        )}

        {/* Approval history */}
        {!isNew && pr?.approvalHistory && pr.approvalHistory.length > 0 && (
          <div className="mt-8 print:hidden">
            <h3 className="mb-2 text-sm font-semibold">Approval History</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">By</th>
                    <th className="px-3 py-2">Comments</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pr.approvalHistory.map((h) => (
                    <tr key={h.id}>
                      <td className="px-3 py-2">{h.action}</td>
                      <td className="px-3 py-2">{h.actedBy?.name ?? '—'}</td>
                      <td className="px-3 py-2">{h.comments ?? '—'}</td>
                      <td className="px-3 py-2">{new Date(h.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <SubmitForApprovalModal
        open={submitModalOpen}
        projectId={projectId}
        queryKey="pr-approvers"
        fetchApprovers={purchaseRequisitionsApi.approvers}
        moduleLabel="Purchase Requisition"
        onClose={() => setSubmitModalOpen(false)}
        onConfirm={(approverId) => submitMutation.mutate(approverId)}
        submitting={submitMutation.isPending}
      />

      <DecisionModal
        open={decisionAction !== null}
        action={decisionAction ?? 'APPROVE'}
        documentLabel="Purchase Requisition"
        onClose={() => setDecisionAction(null)}
        onConfirm={(comments) => decisionAction && decisionMutation.mutate({ action: decisionAction, comments })}
        submitting={decisionMutation.isPending}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Purchase Requisition"
        message={`Delete Draft "${pr?.requestNumber}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          deleteMutation.mutate();
        }}
      />
    </div>
  );
}
