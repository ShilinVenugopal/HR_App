import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { apiErrorMessage } from '../../api/client';
import {
  ADDITIONAL_AMOUNT_TYPE_OPTIONS,
  AdditionalAmountType,
  SUBCONTRACTOR_BILL_STATUS_OPTIONS,
  SubcontractorBill,
  SubcontractorPaymentTransaction,
  subcontractorPaymentsApi,
  TDS_PERCENTAGE_OPTIONS,
  TdsCalculationMode,
  TRANSACTION_STATUS_OPTIONS,
} from '../../api/modules';
import { computeAutoTds, computeGrossBillAmount, computeNetPayableAmount, formatRupees } from '../../utils/subcontractorCalc';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

const BILL_STATUS_CLASS: Record<string, string> = {
  PENDING: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  PAID: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

function BillStatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return (
    <span className={`badge ${BILL_STATUS_CLASS[status] ?? ''}`}>
      {SUBCONTRACTOR_BILL_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}
    </span>
  );
}

export function BillDetailModal({ bill, onClose, readOnly }: { bill: SubcontractorBill | null; onClose: () => void; readOnly?: boolean }) {
  const queryClient = useQueryClient();

  const [foraysWoNumber, setForaysWoNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [basicAmount, setBasicAmount] = useState('');
  const [additionalAmount, setAdditionalAmount] = useState('');
  const [additionalAmountType, setAdditionalAmountType] = useState<AdditionalAmountType | ''>('');
  const [gstAmount, setGstAmount] = useState('');
  const [tdsPercentage, setTdsPercentage] = useState('');
  const [tdsAmount, setTdsAmount] = useState('0');
  const [tdsMode, setTdsMode] = useState<TdsCalculationMode>('AUTO');
  const [tollAmount, setTollAmount] = useState('');
  const [remarks, setRemarks] = useState('');

  const [currentBill, setCurrentBill] = useState<SubcontractorBill | null>(bill);

  const [addingPayment, setAddingPayment] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentGst, setPaymentGst] = useState('');
  const [paymentTds, setPaymentTds] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'PROCESSED' | 'PAID'>('PROCESSED');
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<SubcontractorPaymentTransaction | null>(null);

  useEffect(() => {
    setCurrentBill(bill);
    if (!bill) return;
    setForaysWoNumber(bill.foraysWoNumber ?? '');
    setInvoiceNumber(bill.invoiceNumber);
    setInvoiceDate(bill.invoiceDate.slice(0, 10));
    setBasicAmount(String(bill.basicAmount));
    setAdditionalAmount(String(bill.additionalAmount));
    setAdditionalAmountType(bill.additionalAmountType ?? '');
    setGstAmount(String(bill.gstAmount));
    setTdsPercentage(bill.tdsPercentage ? String(bill.tdsPercentage) : '');
    setTdsAmount(String(bill.tdsAmount));
    setTdsMode(bill.tdsCalculationMode);
    setTollAmount(String(bill.tollAmount));
    setRemarks(bill.remarks ?? '');
    cancelPaymentForm();
  }, [bill]);

  const basic = Number(basicAmount) || 0;
  const additional = Number(additionalAmount) || 0;
  const gst = Number(gstAmount) || 0;
  const toll = Number(tollAmount) || 0;
  const tds = Number(tdsAmount) || 0;
  const grossBillAmount = computeGrossBillAmount(basic, additional, gst, toll);
  const netPayableAmount = computeNetPayableAmount(grossBillAmount, tds);

  const handleBasicAmountChange = (value: string) => {
    setBasicAmount(value);
    if (tdsMode === 'AUTO' && tdsPercentage) {
      setTdsAmount(String(computeAutoTds(Number(value) || 0, Number(tdsPercentage))));
    }
  };
  const handlePercentageChange = (value: string) => {
    setTdsMode('AUTO');
    setTdsPercentage(value);
    setTdsAmount(value ? String(computeAutoTds(basic, Number(value))) : '0');
  };
  const handleManualTdsAmount = (value: string) => {
    setTdsMode('MANUAL');
    setTdsAmount(value);
  };
  const resetToAuto = () => {
    setTdsMode('AUTO');
    setTdsAmount(tdsPercentage ? String(computeAutoTds(basic, Number(tdsPercentage))) : '0');
  };

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: ['subcontractor-bills'] });
    queryClient.invalidateQueries({ queryKey: ['subcontractor-bill-totals'] });
    queryClient.invalidateQueries({ queryKey: ['subcontractor-payment-due'] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!bill) throw new Error('No bill selected');
      if (!invoiceNumber.trim()) throw new Error('Invoice Number is required');
      if (!invoiceDate) throw new Error('Invoice Date is required');
      return subcontractorPaymentsApi.update(bill.id, {
        foraysWoNumber: foraysWoNumber.trim() || undefined,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        basicAmount: basic,
        additionalAmount: additional,
        additionalAmountType: additionalAmountType || undefined,
        gstAmount: gst,
        tdsPercentage: tdsPercentage ? Number(tdsPercentage) : undefined,
        tdsAmount: tds,
        tdsCalculationMode: tdsMode,
        tollAmount: toll,
        remarks: remarks.trim() || undefined,
      });
    },
    onSuccess: (updated) => {
      toast.success('Subcontractor bill updated');
      setCurrentBill(updated);
      invalidateList();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const remainingTdsBalance = currentBill ? Number(currentBill.tdsAmount) - (currentBill.payments ?? []).reduce((s, p) => s + Number(p.tdsAmountDeducted), 0) : 0;

  const startAddPayment = () => {
    setEditingPaymentId(null);
    setAddingPayment(true);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentAmount('');
    setPaymentGst('');
    // Suggest the remaining TDS balance for this next instalment — still
    // freely editable (req. 4.B: "automatically suggest the remaining TDS
    // amount... Allow the user to edit").
    setPaymentTds(String(Math.max(0, Math.round(remainingTdsBalance * 100) / 100)));
    setPaymentReference('');
    setPaymentRemarks('');
    setPaymentStatus('PROCESSED');
  };

  const startEditPayment = (p: SubcontractorPaymentTransaction) => {
    setAddingPayment(false);
    setEditingPaymentId(p.id);
    setPaymentDate(p.paymentDate.slice(0, 10));
    setPaymentAmount(String(p.amountProcessed));
    setPaymentGst(String(p.gstAmountProcessed));
    setPaymentTds(String(p.tdsAmountDeducted));
    setPaymentReference(p.paymentReference ?? '');
    setPaymentRemarks(p.remarks ?? '');
    setPaymentStatus(p.status);
  };

  function cancelPaymentForm() {
    setAddingPayment(false);
    setEditingPaymentId(null);
  }

  const addPaymentMutation = useMutation({
    mutationFn: () => {
      if (!currentBill) throw new Error('No bill selected');
      const amount = Number(paymentAmount) || 0;
      const gstAmt = Number(paymentGst) || 0;
      const tdsAmt = Number(paymentTds) || 0;
      if (!(amount > 0 || gstAmt > 0 || tdsAmt > 0)) throw new Error('Enter at least one of Amount Processed, GST Amount Processed or TDS Amount Deducted');
      if (!paymentDate) throw new Error('Payment Processing Date is required');
      return subcontractorPaymentsApi.addPayment(currentBill.id, {
        paymentDate,
        amountProcessed: amount,
        gstAmountProcessed: gstAmt,
        tdsAmountDeducted: tdsAmt,
        paymentReference: paymentReference.trim() || undefined,
        remarks: paymentRemarks.trim() || undefined,
        status: paymentStatus,
      });
    },
    onSuccess: (updated) => {
      toast.success('Payment processing entry recorded');
      setCurrentBill(updated);
      cancelPaymentForm();
      invalidateList();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const editPaymentMutation = useMutation({
    mutationFn: () => {
      if (!editingPaymentId) throw new Error('No payment selected');
      const amount = Number(paymentAmount) || 0;
      const gstAmt = Number(paymentGst) || 0;
      const tdsAmt = Number(paymentTds) || 0;
      if (!(amount > 0 || gstAmt > 0 || tdsAmt > 0)) throw new Error('Enter at least one of Amount Processed, GST Amount Processed or TDS Amount Deducted');
      if (!paymentDate) throw new Error('Payment Processing Date is required');
      return subcontractorPaymentsApi.updatePayment(editingPaymentId, {
        paymentDate,
        amountProcessed: amount,
        gstAmountProcessed: gstAmt,
        tdsAmountDeducted: tdsAmt,
        paymentReference: paymentReference.trim() || undefined,
        remarks: paymentRemarks.trim() || undefined,
        status: paymentStatus,
      });
    },
    onSuccess: (updated) => {
      toast.success('Payment processing entry updated');
      setCurrentBill(updated);
      cancelPaymentForm();
      invalidateList();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (paymentId: string) => subcontractorPaymentsApi.removePayment(paymentId),
    onSuccess: (updated) => {
      toast.success('Payment processing entry deleted');
      setCurrentBill(updated);
      setDeletePaymentTarget(null);
      invalidateList();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (!bill) return null;

  const payments = currentBill?.payments ?? [];
  const canManage = !readOnly;

  return (
    <Modal
      open={bill !== null}
      onClose={onClose}
      title={readOnly ? 'View Subcontractor Bill' : 'Edit Subcontractor Bill'}
      size="xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              Save
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-400">Project</p>
            <p className="font-medium">{bill.project?.projectName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Subcontractor</p>
            <p className="font-medium">{bill.subcontractor?.companyName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Billing Month</p>
            <p className="font-medium">{MONTHS[bill.billingMonth - 1]} {bill.billingYear}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Invoice Number *</label>
            {readOnly ? <p className="font-medium">{invoiceNumber}</p> : <input className="input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />}
          </div>
          <div>
            <label className="label">Invoice Date *</label>
            {readOnly ? <p className="font-medium">{fmtDate(invoiceDate)}</p> : <input type="date" className="input" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />}
          </div>
          <div>
            <label className="label">Forays WO Number</label>
            {readOnly ? <p className="font-medium">{foraysWoNumber || '—'}</p> : <input className="input" value={foraysWoNumber} onChange={(e) => setForaysWoNumber(e.target.value)} />}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-400">Payment Due Date</p>
            <p className="font-medium">{fmtDate(currentBill?.dueDate)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Payment Status</p>
            <BillStatusBadge status={currentBill?.paymentStatus} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Basic Amount *</label>
            {readOnly ? <p className="font-medium">{formatRupees(basic)}</p> : <input type="number" min="0" step="0.01" className="input" value={basicAmount} onChange={(e) => handleBasicAmountChange(e.target.value)} />}
          </div>
          <div>
            <label className="label">Toll Amount</label>
            {readOnly ? <p className="font-medium">{formatRupees(toll)}</p> : <input type="number" min="0" step="0.01" className="input" value={tollAmount} onChange={(e) => setTollAmount(e.target.value)} />}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Additional Amount</label>
            {readOnly ? <p className="font-medium">{formatRupees(additional)}</p> : <input type="number" min="0" step="0.01" className="input" value={additionalAmount} onChange={(e) => setAdditionalAmount(e.target.value)} />}
          </div>
          <div>
            <label className="label">Additional Amount Description</label>
            {readOnly ? (
              <p className="font-medium">{ADDITIONAL_AMOUNT_TYPE_OPTIONS.find((o) => o.value === additionalAmountType)?.label ?? '—'}</p>
            ) : (
              <select className="input" value={additionalAmountType} onChange={(e) => setAdditionalAmountType(e.target.value as AdditionalAmountType)}>
                <option value="">Select</option>
                {ADDITIONAL_AMOUNT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div>
          <label className="label">GST Amount</label>
          {readOnly ? <p className="font-medium">{formatRupees(gst)}</p> : <input type="number" min="0" step="0.01" className="input" value={gstAmount} onChange={(e) => setGstAmount(e.target.value)} />}
        </div>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">TDS Percentage</label>
              {readOnly ? (
                <p className="font-medium">{tdsPercentage ? `${tdsPercentage}%` : 'No TDS'}</p>
              ) : (
                <select className="input" value={tdsPercentage} onChange={(e) => handlePercentageChange(e.target.value)}>
                  <option value="">No TDS</option>
                  {TDS_PERCENTAGE_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}%
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="label">TDS Amount</label>
              {readOnly ? <p className="font-medium">{formatRupees(tds)}</p> : <input type="number" min="0" step="0.01" className="input" value={tdsAmount} onChange={(e) => handleManualTdsAmount(e.target.value)} />}
            </div>
          </div>
          {!readOnly && (
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className={tdsMode === 'AUTO' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                {tdsMode === 'AUTO' ? 'Auto Calculated' : 'Manually Entered'}
              </span>
              {tdsMode === 'MANUAL' && (
                <button type="button" className="text-brand-600 underline" onClick={resetToAuto}>
                  Reset to Auto Calculation
                </button>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="label">Remarks</label>
          {readOnly ? <p className="font-medium">{remarks || '—'}</p> : <textarea className="input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />}
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-400">Gross Bill Amount</p>
            <p className="text-lg font-bold">{formatRupees(grossBillAmount)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-400">Net Payable Amount</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatRupees(netPayableAmount)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-400">Amount Paid</p>
            <p className="text-lg font-bold">{formatRupees(currentBill?.totalPaidAmount ?? 0)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-400">Outstanding Amount</p>
            <p className={`text-lg font-bold ${(currentBill?.outstandingAmount ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
              {formatRupees(currentBill?.outstandingAmount ?? 0)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400">
          <p>Remaining GST Balance: <span className="font-semibold">{formatRupees(currentBill?.remainingGstBalance ?? 0)}</span></p>
          <p>Remaining TDS Balance: <span className="font-semibold">{formatRupees(currentBill?.remainingTdsBalance ?? 0)}</span></p>
        </div>

        {/* Payment Processing Details — multiple instalments against this invoice */}
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between bg-slate-100 px-3 py-2 text-sm font-semibold dark:bg-slate-800">
            <span>Payment Processing Details</span>
            {canManage && !addingPayment && !editingPaymentId && (
              <button className="btn-ghost px-2 py-1 text-xs" onClick={startAddPayment}>
                <Plus size={14} /> Add Payment Processing Details
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-1.5">Processing Date</th>
                  <th className="px-2 py-1.5">Amount Processed</th>
                  <th className="px-2 py-1.5">GST Processed</th>
                  <th className="px-2 py-1.5">TDS Deducted</th>
                  <th className="px-2 py-1.5">Reference</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5">Entered By</th>
                  {canManage && <th className="px-2 py-1.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payments.map((p) =>
                  editingPaymentId === p.id ? (
                    <tr key={p.id} className="bg-slate-50 dark:bg-slate-800/60">
                      <td className="px-1 py-1">
                        <input type="date" className="input py-1 text-xs" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" min="0" step="0.01" className="input py-1 text-xs" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" min="0" step="0.01" className="input py-1 text-xs" value={paymentGst} onChange={(e) => setPaymentGst(e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" min="0" step="0.01" className="input py-1 text-xs" value={paymentTds} onChange={(e) => setPaymentTds(e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <input className="input py-1 text-xs" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <select className="input py-1 text-xs" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as 'PROCESSED' | 'PAID')}>
                          {TRANSACTION_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-slate-400">{p.createdBy?.name ?? '—'}</td>
                      <td className="px-1 py-1">
                        <div className="flex justify-end gap-1">
                          <button className="btn-primary px-2 py-1 text-xs" disabled={editPaymentMutation.isPending} onClick={() => editPaymentMutation.mutate()}>
                            Save
                          </button>
                          <button className="btn-secondary px-2 py-1 text-xs" onClick={cancelPaymentForm}>
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id}>
                      <td className="px-2 py-1.5">{fmtDate(p.paymentDate)}</td>
                      <td className="px-2 py-1.5 font-medium">{formatRupees(Number(p.amountProcessed))}</td>
                      <td className="px-2 py-1.5">{formatRupees(Number(p.gstAmountProcessed))}</td>
                      <td className="px-2 py-1.5">{formatRupees(Number(p.tdsAmountDeducted))}</td>
                      <td className="px-2 py-1.5">{p.paymentReference || '—'}</td>
                      <td className="px-2 py-1.5">
                        <span className={`badge ${p.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                          {TRANSACTION_STATUS_OPTIONS.find((o) => o.value === p.status)?.label ?? p.status}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-slate-400">{p.createdBy?.name ?? '—'}</td>
                      {canManage && (
                        <td className="px-1 py-1">
                          <div className="flex justify-end gap-1">
                            <button className="btn-ghost p-1" title="Edit" onClick={() => startEditPayment(p)}>
                              <Pencil size={13} />
                            </button>
                            <button className="btn-ghost p-1 text-red-500" title="Delete" onClick={() => setDeletePaymentTarget(p)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                )}
                {addingPayment && (
                  <tr className="bg-slate-50 dark:bg-slate-800/60">
                    <td className="px-1 py-1">
                      <input type="date" className="input py-1 text-xs" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" min="0" step="0.01" className="input py-1 text-xs" placeholder="Amount" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" min="0" step="0.01" className="input py-1 text-xs" placeholder="GST" value={paymentGst} onChange={(e) => setPaymentGst(e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" min="0" step="0.01" className="input py-1 text-xs" placeholder="TDS" value={paymentTds} onChange={(e) => setPaymentTds(e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <input className="input py-1 text-xs" placeholder="Optional" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <select className="input py-1 text-xs" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as 'PROCESSED' | 'PAID')}>
                        {TRANSACTION_STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-slate-400">—</td>
                    <td className="px-1 py-1">
                      <div className="flex justify-end gap-1">
                        <button className="btn-primary px-2 py-1 text-xs" disabled={addPaymentMutation.isPending} onClick={() => addPaymentMutation.mutate()}>
                          Save
                        </button>
                        <button className="btn-secondary px-2 py-1 text-xs" onClick={cancelPaymentForm}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {payments.length === 0 && !addingPayment && (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} className="px-2 py-3 text-center text-slate-400">
                      No payment processing entries recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {(bill.createdBy || bill.updatedBy) && (
          <p className="text-xs text-slate-400">
            Created by {bill.createdBy?.name ?? '—'}
            {bill.updatedBy ? ` · Last updated by ${bill.updatedBy.name}` : ''}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={deletePaymentTarget !== null}
        title="Delete Payment Processing Entry"
        message={`Delete the payment of ${deletePaymentTarget ? formatRupees(Number(deletePaymentTarget.amountProcessed)) : ''} dated ${fmtDate(
          deletePaymentTarget?.paymentDate
        )}? The outstanding amount will be recalculated. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeletePaymentTarget(null)}
        onConfirm={() => deletePaymentTarget && deletePaymentMutation.mutate(deletePaymentTarget.id)}
      />
    </Modal>
  );
}
