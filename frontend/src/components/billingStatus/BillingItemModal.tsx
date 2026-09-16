import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Modal } from '../common/Modal';
import { apiErrorMessage } from '../../api/client';
import { BILLING_STATUS_OPTIONS, BillingItem, BillingItemStatus, billingStatusApi } from '../../api/modules';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function BillingItemModal({ item, onClose, readOnly }: { item: BillingItem | null; onClose: () => void; readOnly?: boolean }) {
  const queryClient = useQueryClient();

  const [plantUnit, setPlantUnit] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [jmsNo, setJmsNo] = useState('');
  const [abstractAmount, setAbstractAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [status, setStatus] = useState<BillingItemStatus>('PENDING_CERTIFICATION');

  useEffect(() => {
    if (!item) return;
    setPlantUnit(item.plantUnit);
    setInvoiceNo(item.invoiceNo ?? '');
    setJmsNo(item.jmsNo ?? '');
    setAbstractAmount(String(item.abstractAmount));
    setTaxAmount(String(item.taxAmount));
    setStatus(item.status);
  }, [item]);

  const totalAmount = (Number(abstractAmount) || 0) + (Number(taxAmount) || 0);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!item) throw new Error('No item selected');
      const abstract = Number(abstractAmount);
      if (!(abstract > 0)) throw new Error('Abstract Amount must be greater than 0');
      return billingStatusApi.updateItem(item.id, {
        plantUnit: plantUnit.trim(),
        invoiceNo: invoiceNo.trim() || undefined,
        jmsNo: jmsNo.trim() || undefined,
        abstractAmount: abstract,
        taxAmount: Number(taxAmount) || 0,
        status,
      });
    },
    onSuccess: () => {
      toast.success('Billing item updated');
      queryClient.invalidateQueries({ queryKey: ['billing-status'] });
      queryClient.invalidateQueries({ queryKey: ['billing-status-summary'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (!item) return null;

  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={readOnly ? 'View Bill Details' : 'Edit Bill Details'}
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
            <label className="label">JMS No.</label>
            {readOnly ? <p className="font-medium">{jmsNo || '—'}</p> : <input className="input" value={jmsNo} onChange={(e) => setJmsNo(e.target.value)} />}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Abstract Amount *</label>
            {readOnly ? (
              <p className="font-medium">₹{Number(abstractAmount).toLocaleString('en-IN')}</p>
            ) : (
              <input type="number" min="0" step="0.01" className="input" value={abstractAmount} onChange={(e) => setAbstractAmount(e.target.value)} />
            )}
          </div>
          <div>
            <label className="label">Tax Amount</label>
            {readOnly ? (
              <p className="font-medium">₹{Number(taxAmount).toLocaleString('en-IN')}</p>
            ) : (
              <input type="number" min="0" step="0.01" className="input" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
            )}
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
          <span className="text-sm font-semibold">Total Amount</span>
          <span className="text-lg font-bold">₹{totalAmount.toLocaleString('en-IN')}</span>
        </div>
        <div>
          <label className="label">Status</label>
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
        {(item.createdBy || item.updatedBy) && (
          <p className="text-xs text-slate-400">
            Created by {item.createdBy?.name ?? '—'}
            {item.updatedBy ? ` · Last updated by ${item.updatedBy.name}` : ''}
          </p>
        )}
      </div>
    </Modal>
  );
}
