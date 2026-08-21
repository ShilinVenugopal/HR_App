import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Boxes, FileDown, Printer, Send, Trash2, Unlock as UnlockIcon } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/common/Badge';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { GrnItemInput, InventoryUnit, grnsApi, purchaseOrdersApi } from '../api/modules';
import { apiErrorMessage } from '../api/client';
import { unitLabel } from '../utils/inventoryExcel';
import { exportGrnExcel } from '../utils/grnExcel';
import { SubmitForApprovalModal } from '../components/procurement/SubmitForApprovalModal';
import { DecisionModal, DecisionAction } from '../components/procurement/DecisionModal';

interface DraftItem {
  key: string;
  costCodeId: string;
  /// Display-only — the cost code is inherited from the source PO item and
  /// is never editable here, so we only need its label, not a lookup list.
  costCodeLabel: string;
  description: string;
  unit: InventoryUnit;
  qtyAsPerChallan: string;
  actualQtyReceived: string;
  acceptedQty: string;
  remarks: string;
}

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `grn-row-${keyCounter}`;
}

export default function GoodsReceivedNoteDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromPoId = searchParams.get('fromPo');
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { can, session } = useAuth();
  const queryClient = useQueryClient();

  const [projectId, setProjectId] = useState('');
  const [poId, setPoId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [challanNumber, setChallanNumber] = useState('');
  const [challanDate, setChallanDate] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [lrDate, setLrDate] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ['grn', id],
    queryFn: () => grnsApi.get(id!),
    enabled: !isNew,
  });

  const { data: sourcePo } = useQuery({
    queryKey: ['po', fromPoId],
    queryFn: () => purchaseOrdersApi.get(fromPoId!),
    enabled: isNew && Boolean(fromPoId),
  });

  const grn = existing?.data;

  useEffect(() => {
    if (!grn) return;
    setProjectId(grn.projectId);
    setPoId(grn.poId);
    setSupplierName(grn.supplierName ?? '');
    setReceiptDate(grn.receiptDate ? grn.receiptDate.slice(0, 10) : '');
    setChallanNumber(grn.challanNumber ?? '');
    setChallanDate(grn.challanDate ? grn.challanDate.slice(0, 10) : '');
    setLrNumber(grn.lrNumber ?? '');
    setLrDate(grn.lrDate ? grn.lrDate.slice(0, 10) : '');
    setTransporterName(grn.transporterName ?? '');
    setItems(
      grn.items.map((it) => ({
        key: newKey(),
        costCodeId: it.costCodeId ?? '',
        costCodeLabel: it.costCode?.code ?? '',
        description: it.description,
        unit: it.unit,
        qtyAsPerChallan: String(it.qtyAsPerChallan),
        actualQtyReceived: String(it.actualQtyReceived),
        acceptedQty: String(it.acceptedQty),
        remarks: it.remarks ?? '',
      }))
    );
  }, [grn]);

  useEffect(() => {
    if (!isNew || !sourcePo?.data) return;
    const po = sourcePo.data;
    setProjectId(po.projectId);
    setPoId(po.id);
    setSupplierName(po.vendor?.name ?? '');
    setItems(
      po.items.map((it) => ({
        key: newKey(),
        costCodeId: it.costCodeId ?? '',
        costCodeLabel: it.costCode?.code ?? '',
        description: it.description,
        unit: it.unit,
        qtyAsPerChallan: String(it.qty),
        actualQtyReceived: '',
        acceptedQty: '',
        remarks: it.remarks ?? '',
      }))
    );
  }, [isNew, sourcePo]);

  const isEditable = isNew || grn?.status === 'DRAFT' || grn?.status === 'RETURNED';
  const canDecide = grn?.status === 'PENDING_APPROVAL' && can('GRN', 'approve');
  const canUpdateInventory = grn?.status === 'APPROVED' && !grn.inventoryUpdatedAt && can('GRN', 'edit');

  const updateRow = (key: string, patch: Partial<DraftItem>) => setItems((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const rejectedQtyFor = (row: DraftItem) => {
    const actual = Number(row.actualQtyReceived) || 0;
    const accepted = Number(row.acceptedQty) || 0;
    return Math.max(0, actual - accepted);
  };

  const buildItemsPayload = (): GrnItemInput[] =>
    items
      .filter((r) => r.description.trim())
      .map((r) => ({
        costCodeId: r.costCodeId || undefined,
        description: r.description.trim(),
        unit: r.unit,
        qtyAsPerChallan: Number(r.qtyAsPerChallan) || 0,
        actualQtyReceived: Number(r.actualQtyReceived) || 0,
        acceptedQty: Number(r.acceptedQty) || 0,
        remarks: r.remarks.trim() || undefined,
      }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const itemsPayload = buildItemsPayload();
      if (!itemsPayload.length) throw new Error('Add at least one item before saving');
      if (!poId) throw new Error('A source Purchase Order is required');
      const payload = {
        projectId,
        poId,
        supplierName: supplierName || undefined,
        receiptDate: receiptDate || undefined,
        challanNumber: challanNumber || undefined,
        challanDate: challanDate || undefined,
        lrNumber: lrNumber || undefined,
        lrDate: lrDate || undefined,
        transporterName: transporterName || undefined,
        items: itemsPayload,
      };
      return isNew ? grnsApi.create(payload) : grnsApi.update(id!, payload);
    },
    onSuccess: (res) => {
      toast.success('Saved as Draft');
      queryClient.invalidateQueries({ queryKey: ['grns'] });
      if (isNew) navigate(`/grns/${res.data.id}`, { replace: true });
      else queryClient.invalidateQueries({ queryKey: ['grn', id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const submitMutation = useMutation({
    mutationFn: (approverId: string) => grnsApi.submit(id!, approverId),
    onSuccess: () => {
      toast.success('Submitted for approval');
      setSubmitModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['grn', id] });
      queryClient.invalidateQueries({ queryKey: ['grns'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const decisionMutation = useMutation({
    mutationFn: (vars: { action: DecisionAction; comments: string }) => {
      if (vars.action === 'APPROVE') return grnsApi.approve(id!, vars.comments || undefined);
      if (vars.action === 'REJECT') return grnsApi.reject(id!, vars.comments);
      return grnsApi.returnToSubmitter(id!, vars.comments);
    },
    onSuccess: (_res, vars) => {
      toast.success(vars.action === 'APPROVE' ? 'Approved' : vars.action === 'REJECT' ? 'Rejected' : 'Returned to submitter');
      setDecisionAction(null);
      queryClient.invalidateQueries({ queryKey: ['grn', id] });
      queryClient.invalidateQueries({ queryKey: ['grns'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const unlockMutation = useMutation({
    mutationFn: () => grnsApi.unlock(id!),
    onSuccess: () => {
      toast.success('Unlocked — back to Draft');
      queryClient.invalidateQueries({ queryKey: ['grn', id] });
      queryClient.invalidateQueries({ queryKey: ['grns'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const updateInventoryMutation = useMutation({
    mutationFn: () => grnsApi.updateInventory(id!),
    onSuccess: () => {
      toast.success('Inventory updated');
      queryClient.invalidateQueries({ queryKey: ['grn', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => grnsApi.remove(id!),
    onSuccess: () => {
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: ['grns'] });
      navigate('/grns');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (!isNew && isLoading) return <p className="text-sm text-slate-400">Loading...</p>;

  return (
    <div>
      <PageHeader
        title={isNew ? 'New Goods Received Note' : `GRN ${grn?.grnNumber ?? ''}`}
        description={grn?.po?.poNumber ? `Against PO: ${grn.po.poNumber}` : 'Select a source Purchase Order, add items, and save as Draft'}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button className="btn-secondary" onClick={() => navigate('/grns')}>
              <ArrowLeft size={16} /> Back
            </button>
            {grn && <Badge value={grn.status} />}
            {!isNew && grn && (
              <>
                <button className="btn-secondary" onClick={() => window.print()}>
                  <Printer size={16} /> Print
                </button>
                <button className="btn-secondary" onClick={() => exportGrnExcel(grn)}>
                  <FileDown size={16} /> Export Excel
                </button>
              </>
            )}
            {isEditable && can('GRN', isNew ? 'add' : 'edit') && (
              <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                Save Draft
              </button>
            )}
            {!isNew && isEditable && can('GRN', 'edit') && (
              <button className="btn-primary" onClick={() => setSubmitModalOpen(true)}>
                <Send size={16} /> Proceed for Approval
              </button>
            )}
            {!isNew && grn?.status === 'DRAFT' && can('GRN', 'delete') && (
              <button className="btn-secondary text-red-600" onClick={() => setDeleteConfirmOpen(true)}>
                <Trash2 size={16} /> Delete
              </button>
            )}
            {canDecide && (
              <>
                <button className="btn-primary" onClick={() => setDecisionAction('APPROVE')}>
                  Approve
                </button>
                <button className="btn-danger" onClick={() => setDecisionAction('REJECT')}>
                  Reject
                </button>
                <button className="btn-secondary" onClick={() => setDecisionAction('RETURN')}>
                  Return
                </button>
              </>
            )}
            {canUpdateInventory && (
              <button className="btn-primary" disabled={updateInventoryMutation.isPending} onClick={() => updateInventoryMutation.mutate()}>
                <Boxes size={16} /> Update Inventory
              </button>
            )}
            {!isNew && grn?.status === 'APPROVED' && !grn.inventoryUpdatedAt && session?.user.role === 'SUPER_ADMIN' && (
              <button className="btn-secondary" onClick={() => unlockMutation.mutate()}>
                <UnlockIcon size={16} /> Unlock
              </button>
            )}
          </div>
        }
      />

      <div className="card p-6">
        <div className="mb-6 flex items-start justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <p className="text-lg font-bold">FORAYS INNOVATIONS PVT LTD</p>
            <p className="text-xs text-slate-500">Mankanthanam Building, Mukkoottuthara, Kanjirappally, Kottayam Dist., Kerala, India – 686 510</p>
            <p className="mt-1 text-xl font-bold">GOODS RECEIVED NOTE</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <label className="label">Supplier Name</label>
            {isEditable ? (
              <input className="input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            ) : (
              <p className="font-medium">{grn?.supplierName ?? '—'}</p>
            )}
          </div>
          <div>
            <label className="label">GRN Number</label>
            <p className="font-mono text-sm">{grn?.grnNumber ?? '(auto-generated on save)'}</p>
          </div>
          <div>
            <label className="label">Project</label>
            <p className="font-medium">{grn?.project?.projectName ?? sourcePo?.data?.project?.projectName ?? '—'}</p>
          </div>
          <div>
            <label className="label">Project Number</label>
            <p className="font-medium">{grn?.project?.projectNumber ?? sourcePo?.data?.project?.projectNumber ?? '—'}</p>
          </div>
          <div>
            <label className="label">P.O. Number</label>
            <p className="font-mono text-sm">{grn?.po?.poNumber ?? sourcePo?.data?.poNumber ?? '—'}</p>
          </div>
          <div>
            <label className="label">Receipt Date</label>
            {isEditable ? (
              <input type="date" className="input" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
            ) : (
              <p className="font-medium">{grn?.receiptDate ? new Date(grn.receiptDate).toLocaleDateString() : '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Challan Number</label>
            {isEditable ? (
              <input className="input" value={challanNumber} onChange={(e) => setChallanNumber(e.target.value)} />
            ) : (
              <p className="font-medium">{grn?.challanNumber ?? '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Challan Date</label>
            {isEditable ? (
              <input type="date" className="input" value={challanDate} onChange={(e) => setChallanDate(e.target.value)} />
            ) : (
              <p className="font-medium">{grn?.challanDate ? new Date(grn.challanDate).toLocaleDateString() : '—'}</p>
            )}
          </div>
          <div>
            <label className="label">LR Number</label>
            {isEditable ? (
              <input className="input" value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} />
            ) : (
              <p className="font-medium">{grn?.lrNumber ?? '—'}</p>
            )}
          </div>
          <div>
            <label className="label">LR Date</label>
            {isEditable ? (
              <input type="date" className="input" value={lrDate} onChange={(e) => setLrDate(e.target.value)} />
            ) : (
              <p className="font-medium">{grn?.lrDate ? new Date(grn.lrDate).toLocaleDateString() : '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Transporter Name</label>
            {isEditable ? (
              <input className="input" value={transporterName} onChange={(e) => setTransporterName(e.target.value)} />
            ) : (
              <p className="font-medium">{grn?.transporterName ?? '—'}</p>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between bg-slate-100 px-3 py-2 text-sm font-semibold dark:bg-slate-800">
            <span>Items</span>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Cost Code</th>
                <th className="px-2 py-1.5">Description</th>
                <th className="px-2 py-1.5">Unit</th>
                <th className="px-2 py-1.5">Qty as per Challan</th>
                <th className="px-2 py-1.5">Actual Qty Received</th>
                <th className="px-2 py-1.5">Accepted Qty</th>
                <th className="px-2 py-1.5">Rejected Qty</th>
                <th className="px-2 py-1.5">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isEditable
                ? items.map((row) => (
                    <tr key={row.key}>
                      <td className="px-2 py-1.5">{row.costCodeLabel || '—'}</td>
                      <td className="px-1 py-1">
                        <input
                          className="input py-1 text-xs"
                          value={row.description}
                          onChange={(e) => updateRow(row.key, { description: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">{unitLabel(row.unit)}</td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          min="0"
                          className="input py-1 text-xs"
                          value={row.qtyAsPerChallan}
                          onChange={(e) => updateRow(row.key, { qtyAsPerChallan: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          min="0"
                          className="input py-1 text-xs"
                          value={row.actualQtyReceived}
                          onChange={(e) => updateRow(row.key, { actualQtyReceived: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          min="0"
                          className="input py-1 text-xs"
                          value={row.acceptedQty}
                          onChange={(e) => updateRow(row.key, { acceptedQty: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-slate-400">{rejectedQtyFor(row)}</td>
                      <td className="px-1 py-1">
                        <input className="input py-1 text-xs" value={row.remarks} onChange={(e) => updateRow(row.key, { remarks: e.target.value })} />
                      </td>
                    </tr>
                  ))
                : grn?.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-2 py-1.5">{item.costCode?.code ?? '—'}</td>
                      <td className="px-2 py-1.5">{item.description}</td>
                      <td className="px-2 py-1.5">{unitLabel(item.unit)}</td>
                      <td className="px-2 py-1.5">{Number(item.qtyAsPerChallan)}</td>
                      <td className="px-2 py-1.5">{Number(item.actualQtyReceived)}</td>
                      <td className="px-2 py-1.5">{Number(item.acceptedQty)}</td>
                      <td className="px-2 py-1.5">{Number(item.rejectedQty)}</td>
                      <td className="px-2 py-1.5">{item.remarks ?? '—'}</td>
                    </tr>
                  ))}
              {isEditable && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-2 text-center text-slate-400">
                    No items — create this GRN from an Approved Purchase Order.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {grn?.inventoryUpdatedAt && (
          <p className="mt-4 text-xs text-emerald-600 dark:text-emerald-400">
            Inventory updated on {new Date(grn.inventoryUpdatedAt).toLocaleString()} by {grn.inventoryUpdatedBy?.name ?? '—'}.
          </p>
        )}

        {!isNew && grn?.approvalHistory && grn.approvalHistory.length > 0 && (
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
                  {grn.approvalHistory.map((h) => (
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
        queryKey="grn-approvers"
        fetchApprovers={grnsApi.approvers}
        moduleLabel="Goods Received Note"
        onClose={() => setSubmitModalOpen(false)}
        onConfirm={(approverId) => submitMutation.mutate(approverId)}
        submitting={submitMutation.isPending}
      />

      <DecisionModal
        open={decisionAction !== null}
        action={decisionAction ?? 'APPROVE'}
        documentLabel="Goods Received Note"
        onClose={() => setDecisionAction(null)}
        onConfirm={(comments) => decisionAction && decisionMutation.mutate({ action: decisionAction, comments })}
        submitting={decisionMutation.isPending}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Goods Received Note"
        message={`Delete Draft "${grn?.grnNumber}"? This cannot be undone.`}
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
