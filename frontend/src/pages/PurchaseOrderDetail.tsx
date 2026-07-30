import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Copy, FileDown, Plus, Printer, Send, Trash2, Unlock as UnlockIcon, Upload } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/common/Badge';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../context/AuthContext';
import { useCostCodeOptions, useProjectOptions, useVendorOptions } from '../hooks/useLookups';
import { InventoryUnit, PoItemInput, PoSettingsInput, purchaseOrdersApi, purchaseRequisitionsApi, uploadsApi } from '../api/modules';
import { apiErrorMessage } from '../api/client';
import { UNIT_OPTIONS, unitLabel } from '../utils/inventoryExcel';
import { amountToWords } from '../utils/numberToWords';
import { DEFAULT_PO_TERMS, resolveTermBody } from '../utils/purchaseOrderTerms';
import { exportPurchaseOrderExcel } from '../utils/purchaseOrderExcel';
import { SubmitForApprovalModal } from '../components/procurement/SubmitForApprovalModal';
import { DecisionModal, DecisionAction } from '../components/procurement/DecisionModal';

interface DraftItem {
  key: string;
  costCodeId: string;
  description: string;
  unit: InventoryUnit;
  qty: string;
  rate: string;
  gstPercent: string;
  remarks: string;
}

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `po-row-${keyCounter}`;
}

function emptyDraftItem(): DraftItem {
  return { key: newKey(), costCodeId: '', description: '', unit: 'NOS', qty: '', rate: '', gstPercent: '0', remarks: '' };
}

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromPrId = searchParams.get('fromPr');
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { can, session } = useAuth();
  const queryClient = useQueryClient();

  const projectOptions = useProjectOptions();
  const vendorOptions = useVendorOptions();
  const costCodeOptions = useCostCodeOptions();

  const [projectId, setProjectId] = useState('');
  const [prId, setPrId] = useState<string | undefined>(undefined);
  const [vendorId, setVendorId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [enquiryNoDate, setEnquiryNoDate] = useState('');
  const [quotationNo, setQuotationNo] = useState('');
  const [ref, setRef] = useState('');
  const [jobNo, setJobNo] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [packingForwarding, setPackingForwarding] = useState('0');
  const [transportationCharges, setTransportationCharges] = useState('0');
  const [taxesAndDuties, setTaxesAndDuties] = useState('0');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ['po', id],
    queryFn: () => purchaseOrdersApi.get(id!),
    enabled: !isNew,
  });

  const { data: sourcePr } = useQuery({
    queryKey: ['pr', fromPrId],
    queryFn: () => purchaseRequisitionsApi.get(fromPrId!),
    enabled: isNew && Boolean(fromPrId),
  });

  const po = existing?.data;

  useEffect(() => {
    if (!po) return;
    setProjectId(po.projectId);
    setPrId(po.prId ?? undefined);
    setVendorId(po.vendorId);
    setPoNumber(po.poNumber);
    setPoDate(po.poDate.slice(0, 10));
    setEnquiryNoDate(po.enquiryNoDate ?? '');
    setQuotationNo(po.quotationNo ?? '');
    setRef(po.ref ?? '');
    setJobNo(po.jobNo ?? '');
    setDeliveryDate(po.deliveryDate ? po.deliveryDate.slice(0, 10) : '');
    setPackingForwarding(String(po.packingForwarding));
    setTransportationCharges(String(po.transportationCharges));
    setTaxesAndDuties(String(po.taxesAndDuties));
    setItems(
      po.items.map((it) => ({
        key: newKey(),
        costCodeId: it.costCodeId ?? '',
        description: it.description,
        unit: it.unit,
        qty: String(it.qty),
        rate: String(it.rate),
        gstPercent: String(it.gstPercent),
        remarks: it.remarks ?? '',
      }))
    );
  }, [po]);

  useEffect(() => {
    if (!isNew || !sourcePr?.data) return;
    const pr = sourcePr.data;
    setProjectId(pr.projectId);
    setPrId(pr.id);
    setJobNo(pr.project?.projectNumber ?? '');
    setItems(
      pr.items.map((it) => ({
        key: newKey(),
        costCodeId: it.costCodeId,
        description: it.materialName,
        unit: it.unit,
        qty: String(it.balQtyReq),
        rate: '',
        gstPercent: '0',
        remarks: it.remarks ?? '',
      }))
    );
  }, [isNew, sourcePr]);

  const isEditable = isNew || po?.status === 'DRAFT';
  const canDecide = po?.status === 'PENDING_APPROVAL' && can('PURCHASE_ORDER', 'approve');

  const addRow = () => setItems((prev) => [...prev, emptyDraftItem()]);
  const duplicateRow = (key: string) =>
    setItems((prev) => {
      const idx = prev.findIndex((r) => r.key === key);
      if (idx === -1) return prev;
      const copy = { ...prev[idx], key: newKey() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  const deleteRow = (key: string) => setItems((prev) => prev.filter((r) => r.key !== key));
  const updateRow = (key: string, patch: Partial<DraftItem>) => setItems((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const computeItemAmounts = (row: DraftItem) => {
    const qty = Number(row.qty) || 0;
    const rate = Number(row.rate) || 0;
    const amount = qty * rate;
    const gstPercent = Number(row.gstPercent) || 0;
    const gstAmount = (amount * gstPercent) / 100;
    const extendedPrice = amount + gstAmount;
    return { amount, gstAmount, extendedPrice };
  };

  const liveSubtotal = items.reduce((sum, row) => sum + computeItemAmounts(row).extendedPrice, 0);
  const liveGrandTotal = liveSubtotal + (Number(packingForwarding) || 0) + (Number(transportationCharges) || 0) + (Number(taxesAndDuties) || 0);

  const buildItemsPayload = (): PoItemInput[] =>
    items
      .filter((r) => r.description.trim())
      .map((r) => ({
        costCodeId: r.costCodeId || undefined,
        description: r.description.trim(),
        unit: r.unit,
        qty: Number(r.qty) || 0,
        rate: Number(r.rate) || 0,
        gstPercent: Number(r.gstPercent) || 0,
        remarks: r.remarks.trim() || undefined,
      }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const itemsPayload = buildItemsPayload();
      if (!itemsPayload.length) throw new Error('Add at least one item before saving');
      if (!vendorId) throw new Error('Select a vendor');
      if (!poNumber.trim()) throw new Error('PO Number is required');
      const payload = {
        projectId,
        prId,
        vendorId,
        poNumber: poNumber.trim(),
        poDate,
        enquiryNoDate: enquiryNoDate || undefined,
        quotationNo: quotationNo || undefined,
        ref: ref || undefined,
        jobNo: jobNo || undefined,
        deliveryDate: deliveryDate || undefined,
        packingForwarding: Number(packingForwarding) || 0,
        transportationCharges: Number(transportationCharges) || 0,
        taxesAndDuties: Number(taxesAndDuties) || 0,
        items: itemsPayload,
      };
      return isNew ? purchaseOrdersApi.create(payload) : purchaseOrdersApi.update(id!, payload);
    },
    onSuccess: (res) => {
      toast.success('Saved as Draft');
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      if (isNew) navigate(`/purchase-orders/${res.data.id}`, { replace: true });
      else queryClient.invalidateQueries({ queryKey: ['po', id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const submitMutation = useMutation({
    mutationFn: (approverId: string) => purchaseOrdersApi.submit(id!, approverId),
    onSuccess: () => {
      toast.success('Submitted for approval');
      setSubmitModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['po', id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const decisionMutation = useMutation({
    mutationFn: (vars: { action: DecisionAction; comments: string }) =>
      vars.action === 'APPROVE' ? purchaseOrdersApi.approve(id!, vars.comments || undefined) : purchaseOrdersApi.reject(id!, vars.comments),
    onSuccess: (_res, vars) => {
      toast.success(vars.action === 'APPROVE' ? 'Approved' : 'Rejected');
      setDecisionAction(null);
      queryClient.invalidateQueries({ queryKey: ['po', id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const unlockMutation = useMutation({
    mutationFn: () => purchaseOrdersApi.unlock(id!),
    onSuccess: () => {
      toast.success('Unlocked — back to Draft');
      queryClient.invalidateQueries({ queryKey: ['po', id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => purchaseOrdersApi.remove(id!),
    onSuccess: () => {
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      navigate('/purchase-orders');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (!isNew && isLoading) return <p className="text-sm text-slate-400">Loading...</p>;

  return (
    <div>
      <PageHeader
        title={isNew ? 'New Purchase Order' : `Purchase Order ${po?.poNumber ?? ''}`}
        description={po?.vendor?.name ? `Vendor: ${po.vendor.name}` : 'Select a vendor, add items, and save as Draft'}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button className="btn-secondary" onClick={() => navigate('/purchase-orders')}>
              <ArrowLeft size={16} /> Back
            </button>
            {po && <Badge value={po.status} />}
            {!isNew && po && (
              <>
                <button className="btn-secondary" onClick={() => window.print()}>
                  <Printer size={16} /> Print
                </button>
                <button className="btn-secondary" onClick={() => exportPurchaseOrderExcel(po)}>
                  <FileDown size={16} /> Export Excel
                </button>
              </>
            )}
            {isEditable && can('PURCHASE_ORDER', isNew ? 'add' : 'edit') && (
              <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                Save Draft
              </button>
            )}
            {!isNew && isEditable && can('PURCHASE_ORDER', 'edit') && (
              <button className="btn-primary" onClick={() => setSubmitModalOpen(true)}>
                <Send size={16} /> Proceed for Approval
              </button>
            )}
            {!isNew && po?.status === 'DRAFT' && can('PURCHASE_ORDER', 'delete') && (
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
              </>
            )}
            {!isNew && po?.status === 'APPROVED' && session?.user.role === 'SUPER_ADMIN' && (
              <button className="btn-secondary" onClick={() => unlockMutation.mutate()}>
                <UnlockIcon size={16} /> Unlock
              </button>
            )}
            {!isNew && session?.user.role === 'SUPER_ADMIN' && (
              <button className="btn-secondary" onClick={() => setSettingsModalOpen(true)}>
                Edit Billing/Terms/Signature
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
            <p className="mt-1 text-xl font-bold">PURCHASE ORDER</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <label className="label">Project *</label>
            {isEditable ? (
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!isNew || Boolean(fromPrId)}>
                <option value="">Select project...</option>
                {projectOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="font-medium">{po?.project?.projectName ?? '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Vendor *</label>
            {isEditable ? (
              <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Select vendor...</option>
                {vendorOptions.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="font-medium">{po?.vendor?.name ?? '—'}</p>
            )}
          </div>
          <div>
            <label className="label">P.O. Number *</label>
            {isEditable ? (
              <input className="input" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
            ) : (
              <p className="font-mono text-sm">{po?.poNumber}</p>
            )}
          </div>
          <div>
            <label className="label">P.O. Date</label>
            {isEditable ? (
              <input type="date" className="input" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
            ) : (
              <p className="font-medium">{po ? new Date(po.poDate).toLocaleDateString() : '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Enq. No. & Date</label>
            {isEditable ? (
              <input className="input" value={enquiryNoDate} onChange={(e) => setEnquiryNoDate(e.target.value)} />
            ) : (
              <p className="font-medium">{po?.enquiryNoDate ?? '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Quotation No.</label>
            {isEditable ? (
              <input className="input" value={quotationNo} onChange={(e) => setQuotationNo(e.target.value)} />
            ) : (
              <p className="font-medium">{po?.quotationNo ?? '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Ref</label>
            {isEditable ? <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /> : <p className="font-medium">{po?.ref ?? '—'}</p>}
          </div>
          <div>
            <label className="label">Job No. (Project No.)</label>
            {isEditable ? (
              <input className="input" value={jobNo} onChange={(e) => setJobNo(e.target.value)} />
            ) : (
              <p className="font-medium">{po?.jobNo ?? '—'}</p>
            )}
          </div>
          <div>
            <label className="label">Delivery Date</label>
            {isEditable ? (
              <input type="date" className="input" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            ) : (
              <p className="font-medium">{po?.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString() : '—'}</p>
            )}
          </div>
          {po?.pr && (
            <div>
              <label className="label">Source PR</label>
              <p className="font-mono text-sm">{po.pr.requestNumber}</p>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between bg-slate-100 px-3 py-2 text-sm font-semibold dark:bg-slate-800">
            <span>Items</span>
            {isEditable && (
              <button className="btn-ghost px-2 py-1 text-xs print:hidden" onClick={addRow}>
                <Plus size={14} /> Add Row
              </button>
            )}
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Cost Code</th>
                <th className="px-2 py-1.5">Description</th>
                <th className="px-2 py-1.5">Unit</th>
                <th className="px-2 py-1.5">Qty</th>
                <th className="px-2 py-1.5">Rate</th>
                <th className="px-2 py-1.5">Amount</th>
                <th className="px-2 py-1.5">GST %</th>
                <th className="px-2 py-1.5">GST Amt</th>
                <th className="px-2 py-1.5">Extended Price</th>
                {isEditable && <th className="px-2 py-1.5 print:hidden">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isEditable
                ? items.map((row) => {
                    const { amount, gstAmount, extendedPrice } = computeItemAmounts(row);
                    return (
                      <tr key={row.key}>
                        <td className="px-1 py-1">
                          <select className="input py-1 text-xs" value={row.costCodeId} onChange={(e) => updateRow(row.key, { costCodeId: e.target.value })}>
                            <option value="">—</option>
                            {costCodeOptions.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.code}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input className="input py-1 text-xs" value={row.description} onChange={(e) => updateRow(row.key, { description: e.target.value })} />
                        </td>
                        <td className="px-1 py-1">
                          <select className="input py-1 text-xs" value={row.unit} onChange={(e) => updateRow(row.key, { unit: e.target.value as InventoryUnit })}>
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" min="0" className="input py-1 text-xs" value={row.qty} onChange={(e) => updateRow(row.key, { qty: e.target.value })} />
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" min="0" className="input py-1 text-xs" value={row.rate} onChange={(e) => updateRow(row.key, { rate: e.target.value })} />
                        </td>
                        <td className="px-2 py-1 text-slate-400">{amount.toLocaleString('en-IN')}</td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="input py-1 text-xs"
                            value={row.gstPercent}
                            onChange={(e) => updateRow(row.key, { gstPercent: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1 text-slate-400">{gstAmount.toLocaleString('en-IN')}</td>
                        <td className="px-2 py-1 font-medium">{extendedPrice.toLocaleString('en-IN')}</td>
                        <td className="px-1 py-1 print:hidden">
                          <div className="flex gap-1">
                            <button className="btn-ghost p-1" onClick={() => duplicateRow(row.key)} title="Duplicate">
                              <Copy size={13} />
                            </button>
                            <button className="btn-ghost p-1 text-red-500" onClick={() => deleteRow(row.key)} title="Delete">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                : po?.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-2 py-1.5">{item.costCode?.code ?? '—'}</td>
                      <td className="px-2 py-1.5">{item.description}</td>
                      <td className="px-2 py-1.5">{unitLabel(item.unit)}</td>
                      <td className="px-2 py-1.5">{Number(item.qty)}</td>
                      <td className="px-2 py-1.5">{Number(item.rate).toLocaleString('en-IN')}</td>
                      <td className="px-2 py-1.5">{Number(item.amount).toLocaleString('en-IN')}</td>
                      <td className="px-2 py-1.5">{Number(item.gstPercent)}%</td>
                      <td className="px-2 py-1.5">{Number(item.gstAmount).toLocaleString('en-IN')}</td>
                      <td className="px-2 py-1.5 font-medium">{Number(item.extendedPrice).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
              {isEditable && items.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-2 py-2 text-center text-slate-400">
                    No items yet — add a row above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-sm space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span className="font-medium">₹{(po ? Number(po.subtotal) : liveSubtotal).toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Packing & Forwarding</span>
              {isEditable ? (
                <input
                  type="number"
                  min="0"
                  className="input w-32 py-1 text-right text-xs"
                  value={packingForwarding}
                  onChange={(e) => setPackingForwarding(e.target.value)}
                />
              ) : (
                <span>₹{Number(po?.packingForwarding ?? 0).toLocaleString('en-IN')}</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span>Transportation Charges</span>
              {isEditable ? (
                <input
                  type="number"
                  min="0"
                  className="input w-32 py-1 text-right text-xs"
                  value={transportationCharges}
                  onChange={(e) => setTransportationCharges(e.target.value)}
                />
              ) : (
                <span>₹{Number(po?.transportationCharges ?? 0).toLocaleString('en-IN')}</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span>Taxes & Duties</span>
              {isEditable ? (
                <input
                  type="number"
                  min="0"
                  className="input w-32 py-1 text-right text-xs"
                  value={taxesAndDuties}
                  onChange={(e) => setTaxesAndDuties(e.target.value)}
                />
              ) : (
                <span>₹{Number(po?.taxesAndDuties ?? 0).toLocaleString('en-IN')}</span>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-bold dark:border-slate-800">
              <span>Grand Total</span>
              <span>₹{(po ? Number(po.grandTotal) : liveGrandTotal).toLocaleString('en-IN')}</span>
            </div>
            <p className="text-xs italic text-slate-500">{amountToWords(po ? Number(po.grandTotal) : liveGrandTotal)}</p>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-800">
          <h3 className="mb-2 text-sm font-semibold">Billing Address & GST</h3>
          <p className="text-sm">
            {po?.billingAddress ?? 'Forays Innovations Pvt. Ltd., Mankanthanam Building, Mukkoottuthara, Kanjirappally, Kottayam Dist., Kerala, India – 686 510'}
          </p>
          <p className="text-sm text-slate-500">GST No: {po?.billingGstNumber ?? '32AAGCF9837M1Z4'}</p>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-800">
          <h3 className="mb-3 text-sm font-semibold">Terms & Conditions</h3>
          <div className="space-y-3 text-xs">
            {DEFAULT_PO_TERMS.map((term) => (
              <div key={term.id}>
                <p className="font-semibold">{term.heading}</p>
                <p className="whitespace-pre-line text-slate-600 dark:text-slate-400">{resolveTermBody(term, po?.termsAndConditions)}</p>
              </div>
            ))}
          </div>
        </div>

        {!isNew && po && (
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-slate-200 pt-6 text-sm dark:border-slate-800">
            <div>
              <p className="font-semibold">for Forays Innovations Pvt Ltd.</p>
              {po.signatureImageUrl && <img src={po.signatureImageUrl} alt="Authorized signature" className="mt-2 h-16" />}
              <p className="mt-2">Authorized Signatory</p>
              <p>Name: {po.authorizedName ?? '—'}</p>
              <p>Designation: {po.authorizedDesignation ?? '—'}</p>
            </div>
            <div>
              <p className="font-semibold">We accept</p>
              <p className="mt-2">for {po.vendor?.name ?? ''}</p>
            </div>
          </div>
        )}

        {!isNew && po?.approvalHistory && po.approvalHistory.length > 0 && (
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
                  {po.approvalHistory.map((h) => (
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
        queryKey="po-approvers"
        fetchApprovers={purchaseOrdersApi.approvers}
        moduleLabel="Purchase Order"
        onClose={() => setSubmitModalOpen(false)}
        onConfirm={(approverId) => submitMutation.mutate(approverId)}
        submitting={submitMutation.isPending}
      />

      <DecisionModal
        open={decisionAction !== null}
        action={decisionAction ?? 'APPROVE'}
        documentLabel="Purchase Order"
        onClose={() => setDecisionAction(null)}
        onConfirm={(comments) => decisionAction && decisionMutation.mutate({ action: decisionAction, comments })}
        submitting={decisionMutation.isPending}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Purchase Order"
        message={`Delete Draft "${po?.poNumber}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          deleteMutation.mutate();
        }}
      />

      {settingsModalOpen && po && (
        <PoSettingsModal
          open={settingsModalOpen}
          po={po}
          onClose={() => setSettingsModalOpen(false)}
          onSaved={() => {
            setSettingsModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['po', id] });
          }}
        />
      )}
    </div>
  );
}

interface PoSettingsSubject {
  id: string;
  billingAddress?: string | null;
  billingGstNumber?: string | null;
  authorizedName?: string | null;
  authorizedDesignation?: string | null;
  signatureImageUrl?: string | null;
}

function PoSettingsModal({
  open,
  po,
  onClose,
  onSaved,
}: {
  open: boolean;
  po: PoSettingsSubject;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [billingAddress, setBillingAddress] = useState(po.billingAddress ?? '');
  const [billingGstNumber, setBillingGstNumber] = useState(po.billingGstNumber ?? '');
  const [authorizedName, setAuthorizedName] = useState(po.authorizedName ?? '');
  const [authorizedDesignation, setAuthorizedDesignation] = useState(po.authorizedDesignation ?? '');
  const [signatureImageUrl, setSignatureImageUrl] = useState(po.signatureImageUrl ?? '');
  const [uploading, setUploading] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (payload: PoSettingsInput) => purchaseOrdersApi.updateSettings(po.id, payload),
    onSuccess: () => {
      toast.success('Purchase Order settings updated');
      onSaved();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const handleFileChange = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await uploadsApi.upload(file);
      setSignatureImageUrl(url);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Billing / Terms / Signature (Super Admin)"
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate({ billingAddress, billingGstNumber, authorizedName, authorizedDesignation, signatureImageUrl })}
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Billing Address</label>
          <textarea className="input" rows={3} value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} />
        </div>
        <div>
          <label className="label">Billing GST Number</label>
          <input className="input" value={billingGstNumber} onChange={(e) => setBillingGstNumber(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Authorized Name</label>
            <input className="input" value={authorizedName} onChange={(e) => setAuthorizedName(e.target.value)} />
          </div>
          <div>
            <label className="label">Authorized Designation</label>
            <input className="input" value={authorizedDesignation} onChange={(e) => setAuthorizedDesignation(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Signature Image</label>
          {signatureImageUrl && <img src={signatureImageUrl} alt="Signature" className="mb-2 h-16" />}
          <label className="btn-secondary inline-flex cursor-pointer items-center gap-2">
            <Upload size={15} />
            {uploading ? 'Uploading...' : 'Upload Signature'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileChange(file);
              }}
            />
          </label>
        </div>
        <p className="text-xs text-slate-400">
          Terms & Conditions text overrides are not yet editable from this dialog — contact engineering if a specific term needs to change for
          this PO.
        </p>
      </div>
    </Modal>
  );
}
