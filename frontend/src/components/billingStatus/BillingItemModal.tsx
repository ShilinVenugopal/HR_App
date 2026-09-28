import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Badge } from '../common/Badge';
import { apiErrorMessage } from '../../api/client';
import { BILLING_STATUS_OPTIONS, BillingItem, BillingItemStatus, BillingPayment, billingStatusApi } from '../../api/modules';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

function fmtMoney(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  FULLY_PAID: 'Fully Paid',
  OVERPAID: 'Overpaid — Review',
};

const PAYMENT_STATUS_CLASS: Record<string, string> = {
  UNPAID: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  FULLY_PAID: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  OVERPAID: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
};

function PaymentStatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return <span className={`badge ${PAYMENT_STATUS_CLASS[status] ?? ''}`}>{PAYMENT_STATUS_LABEL[status] ?? status}</span>;
}

export function BillingItemModal({ item, onClose, readOnly }: { item: BillingItem | null; onClose: () => void; readOnly?: boolean }) {
  const queryClient = useQueryClient();

  const [plantUnit, setPlantUnit] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [jmsNo, setJmsNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [abstractAmount, setAbstractAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [status, setStatus] = useState<BillingItemStatus>('PENDING_CERTIFICATION');

  // The item is refreshed in place (from each payment mutation's response)
  // so the payment history / outstanding amount stay live without closing
  // the modal — the parent's row data is invalidated separately for when
  // the modal does close.
  const [currentItem, setCurrentItem] = useState<BillingItem | null>(item);

  const [addingPayment, setAddingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [deletePayment, setDeletePayment] = useState<BillingPayment | null>(null);

  useEffect(() => {
    setCurrentItem(item);
    if (!item) return;
    setPlantUnit(item.plantUnit);
    setInvoiceNo(item.invoiceNo ?? '');
    setJmsNo(item.jmsNo ?? '');
    setInvoiceDate(item.invoiceDate ? item.invoiceDate.slice(0, 10) : '');
    setAbstractAmount(String(item.abstractAmount));
    setTaxAmount(String(item.taxAmount));
    setStatus(item.status);
    setAddingPayment(false);
    setEditingPaymentId(null);
    setPaymentAmount('');
    setPaymentDate('');
    setPaymentRemarks('');
  }, [item]);

  const totalAmount = (Number(abstractAmount) || 0) + (Number(taxAmount) || 0);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!item) throw new Error('No item selected');
      const abstract = Number(abstractAmount);
      if (!(abstract > 0)) throw new Error('Abstract Amount must be greater than 0');
      if (!invoiceDate) throw new Error('Invoice Date is required');
      return billingStatusApi.updateItem(item.id, {
        plantUnit: plantUnit.trim(),
        invoiceNo: invoiceNo.trim() || undefined,
        jmsNo: jmsNo.trim() || undefined,
        invoiceDate,
        abstractAmount: abstract,
        taxAmount: Number(taxAmount) || 0,
        status,
      });
    },
    onSuccess: () => {
      toast.success('Billing item updated');
      queryClient.invalidateQueries({ queryKey: ['billing-status'] });
      queryClient.invalidateQueries({ queryKey: ['billing-status-summary'] });
      queryClient.invalidateQueries({ queryKey: ['billing-payment-due'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const addPaymentMutation = useMutation({
    mutationFn: () => {
      if (!currentItem) throw new Error('No item selected');
      const amount = Number(paymentAmount);
      if (!(amount > 0)) throw new Error('Amount Received must be greater than 0');
      if (!paymentDate) throw new Error('Payment Date is required');
      return billingStatusApi.addPayment(currentItem.id, { amountReceived: amount, paymentDate, remarks: paymentRemarks.trim() || undefined });
    },
    onSuccess: (updated) => {
      toast.success('Payment recorded');
      setCurrentItem(updated);
      setAddingPayment(false);
      setPaymentAmount('');
      setPaymentDate('');
      setPaymentRemarks('');
      queryClient.invalidateQueries({ queryKey: ['billing-status'] });
      queryClient.invalidateQueries({ queryKey: ['billing-status-summary'] });
      queryClient.invalidateQueries({ queryKey: ['billing-payment-due'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const editPaymentMutation = useMutation({
    mutationFn: () => {
      if (!editingPaymentId) throw new Error('No payment selected');
      const amount = Number(paymentAmount);
      if (!(amount > 0)) throw new Error('Amount Received must be greater than 0');
      if (!paymentDate) throw new Error('Payment Date is required');
      return billingStatusApi.updatePayment(editingPaymentId, { amountReceived: amount, paymentDate, remarks: paymentRemarks.trim() || undefined });
    },
    onSuccess: (updated) => {
      toast.success('Payment updated');
      setCurrentItem(updated);
      setEditingPaymentId(null);
      setPaymentAmount('');
      setPaymentDate('');
      setPaymentRemarks('');
      queryClient.invalidateQueries({ queryKey: ['billing-status'] });
      queryClient.invalidateQueries({ queryKey: ['billing-status-summary'] });
      queryClient.invalidateQueries({ queryKey: ['billing-payment-due'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (paymentId: string) => billingStatusApi.removePayment(paymentId),
    onSuccess: (updated) => {
      toast.success('Payment deleted');
      setCurrentItem(updated);
      setDeletePayment(null);
      queryClient.invalidateQueries({ queryKey: ['billing-status'] });
      queryClient.invalidateQueries({ queryKey: ['billing-status-summary'] });
      queryClient.invalidateQueries({ queryKey: ['billing-payment-due'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (!item) return null;

  const startAddPayment = () => {
    setEditingPaymentId(null);
    setAddingPayment(true);
    setPaymentAmount('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentRemarks('');
  };

  const startEditPayment = (p: BillingPayment) => {
    setAddingPayment(false);
    setEditingPaymentId(p.id);
    setPaymentAmount(String(p.amountReceived));
    setPaymentDate(p.paymentDate.slice(0, 10));
    setPaymentRemarks(p.remarks ?? '');
  };

  const cancelPaymentForm = () => {
    setAddingPayment(false);
    setEditingPaymentId(null);
  };

  const payments = currentItem?.payments ?? [];
  const canManagePayments = !readOnly;

  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={readOnly ? 'View Bill Details' : 'Edit Bill Details'}
      size="lg"
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
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-400">Project</p>
            <p className="font-medium">{item.billingRecord?.project?.projectName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Billing Period</p>
            <p className="font-medium">
              {item.billingRecord ? `${MONTHS[item.billingRecord.billingMonth - 1]} ${item.billingRecord.billingYear}` : '—'}
            </p>
          </div>
        </div>

        <div>
          <label className="label">Plant / Unit *</label>
          {readOnly ? <p className="font-medium">{plantUnit}</p> : <input className="input" value={plantUnit} onChange={(e) => setPlantUnit(e.target.value)} />}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Invoice No.</label>
            {readOnly ? (
              <p className="font-medium">{invoiceNo || '—'}</p>
            ) : (
              <input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            )}
          </div>
          <div>
            <label className="label">Invoice Date *</label>
            {readOnly ? (
              <p className="font-medium">{fmtDate(invoiceDate)}</p>
            ) : (
              <input type="date" className="input" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">JMS No.</label>
            {readOnly ? <p className="font-medium">{jmsNo || '—'}</p> : <input className="input" value={jmsNo} onChange={(e) => setJmsNo(e.target.value)} />}
          </div>
          <div>
            <label className="label">Payment Due Date</label>
            <p className="font-medium">{fmtDate(currentItem?.dueDate)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Abstract Amount *</label>
            {readOnly ? (
              <p className="font-medium">{fmtMoney(Number(abstractAmount))}</p>
            ) : (
              <input type="number" min="0" step="0.01" className="input" value={abstractAmount} onChange={(e) => setAbstractAmount(e.target.value)} />
            )}
          </div>
          <div>
            <label className="label">Tax Amount</label>
            {readOnly ? (
              <p className="font-medium">{fmtMoney(Number(taxAmount))}</p>
            ) : (
              <input type="number" min="0" step="0.01" className="input" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-400">Total Amount</p>
            <p className="text-lg font-bold">{fmtMoney(totalAmount)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-400">Amount Received</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(currentItem?.totalReceived ?? 0)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-400">Outstanding Amount</p>
            <p className={`text-lg font-bold ${(currentItem?.outstandingAmount ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
              {fmtMoney(currentItem?.outstandingAmount ?? 0)}
            </p>
          </div>
        </div>

        {currentItem?.paymentStatus === 'OVERPAID' && (
          <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
            Amount received exceeds the invoice amount by {fmtMoney(Math.abs(currentItem.outstandingAmount ?? 0))} — flagged for review, not
            silently treated as fully paid.
          </p>
        )}

        <div className="flex items-center justify-between">
          <div>
            <label className="label">Payment Status</label>
            <PaymentStatusBadge status={currentItem?.paymentStatus} />
          </div>
          <div>
            <label className="label">Workflow Status</label>
            {readOnly ? (
              <p className="font-medium">{BILLING_STATUS_OPTIONS.find((s) => s.value === status)?.label}</p>
            ) : (
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as BillingItemStatus)}>
                {BILLING_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Payment History — multiple partial-payment rows against this invoice */}
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between bg-slate-100 px-3 py-2 text-sm font-semibold dark:bg-slate-800">
            <span>Payment History</span>
            {canManagePayments && !addingPayment && !editingPaymentId && (
              <button className="btn-ghost px-2 py-1 text-xs" onClick={startAddPayment}>
                <Plus size={14} /> Add Payment
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-1.5">Payment Date</th>
                  <th className="px-2 py-1.5">Amount Received</th>
                  <th className="px-2 py-1.5">Remarks</th>
                  <th className="px-2 py-1.5">Entered By</th>
                  {canManagePayments && <th className="px-2 py-1.5 text-right">Actions</th>}
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
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input py-1 text-xs"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input className="input py-1 text-xs" value={paymentRemarks} onChange={(e) => setPaymentRemarks(e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5 text-slate-400">{p.createdBy?.name ?? '—'}</td>
                      <td className="px-1 py-1">
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn-primary px-2 py-1 text-xs"
                            disabled={editPaymentMutation.isPending}
                            onClick={() => editPaymentMutation.mutate()}
                          >
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
                      <td className="px-2 py-1.5 font-medium">{fmtMoney(Number(p.amountReceived))}</td>
                      <td className="px-2 py-1.5">{p.remarks || '—'}</td>
                      <td className="px-2 py-1.5 text-slate-400">{p.createdBy?.name ?? '—'}</td>
                      {canManagePayments && (
                        <td className="px-1 py-1">
                          <div className="flex justify-end gap-1">
                            <button className="btn-ghost p-1" title="Edit Payment" onClick={() => startEditPayment(p)}>
                              <Pencil size={13} />
                            </button>
                            <button className="btn-ghost p-1 text-red-500" title="Delete Payment" onClick={() => setDeletePayment(p)}>
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
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input py-1 text-xs"
                        placeholder="Amount"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="input py-1 text-xs"
                        placeholder="Optional"
                        value={paymentRemarks}
                        onChange={(e) => setPaymentRemarks(e.target.value)}
                      />
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
                    <td colSpan={canManagePayments ? 5 : 4} className="px-2 py-3 text-center text-slate-400">
                      No payments recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {(item.createdBy || item.updatedBy) && (
          <p className="text-xs text-slate-400">
            Created by {item.createdBy?.name ?? '—'}
            {item.updatedBy ? ` · Last updated by ${item.updatedBy.name}` : ''}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={deletePayment !== null}
        title="Delete Payment"
        message={`Delete the payment of ${deletePayment ? fmtMoney(Number(deletePayment.amountReceived)) : ''} dated ${fmtDate(
          deletePayment?.paymentDate
        )}? The outstanding amount will be recalculated. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeletePayment(null)}
        onConfirm={() => deletePayment && deletePaymentMutation.mutate(deletePayment.id)}
      />
    </Modal>
  );
}
