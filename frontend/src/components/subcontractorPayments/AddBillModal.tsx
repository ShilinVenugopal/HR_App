import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Modal } from '../common/Modal';
import { apiErrorMessage } from '../../api/client';
import {
  ADDITIONAL_AMOUNT_TYPE_OPTIONS,
  AdditionalAmountType,
  subcontractorPaymentsApi,
  TDS_PERCENTAGE_OPTIONS,
  TdsCalculationMode,
} from '../../api/modules';
import { useProjectOptions, useSubcontractorOptions } from '../../hooks/useLookups';
import { computeAutoTds, computeGrossBillAmount, computeNetPayableAmount, formatRupees } from '../../utils/subcontractorCalc';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const emptyForm = {
  projectId: '',
  subcontractorId: '',
  billingMonth: String(new Date().getMonth() + 1),
  billingYear: String(new Date().getFullYear()),
  invoiceNumber: '',
  invoiceDate: '',
  foraysWoNumber: '',
  basicAmount: '',
  additionalAmount: '',
  additionalAmountType: '' as AdditionalAmountType | '',
  gstAmount: '',
  tdsPercentage: '',
  tdsAmount: '0',
  tollAmount: '',
  remarks: '',
};

export function AddBillModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();
  const subcontractorOptions = useSubcontractorOptions();

  const [form, setForm] = useState(emptyForm);
  const [tdsMode, setTdsMode] = useState<TdsCalculationMode>('AUTO');

  const reset = () => {
    setForm(emptyForm);
    setTdsMode('AUTO');
  };

  const basicAmount = Number(form.basicAmount) || 0;
  const additionalAmount = Number(form.additionalAmount) || 0;
  const gstAmount = Number(form.gstAmount) || 0;
  const tollAmount = Number(form.tollAmount) || 0;
  const tdsAmount = Number(form.tdsAmount) || 0;
  const grossBillAmount = computeGrossBillAmount(basicAmount, additionalAmount, gstAmount, tollAmount);
  const netPayableAmount = computeNetPayableAmount(grossBillAmount, tdsAmount);

  const handleBasicAmountChange = (value: string) => {
    setForm((f) => {
      const next = { ...f, basicAmount: value };
      if (tdsMode === 'AUTO' && f.tdsPercentage) {
        next.tdsAmount = String(computeAutoTds(Number(value) || 0, Number(f.tdsPercentage)));
      }
      return next;
    });
  };

  const handlePercentageChange = (value: string) => {
    setTdsMode('AUTO');
    setForm((f) => ({ ...f, tdsPercentage: value, tdsAmount: value ? String(computeAutoTds(Number(f.basicAmount) || 0, Number(value))) : '0' }));
  };

  const handleManualTdsAmount = (value: string) => {
    setTdsMode('MANUAL');
    setForm((f) => ({ ...f, tdsAmount: value }));
  };

  const resetToAuto = () => {
    setTdsMode('AUTO');
    setForm((f) => ({ ...f, tdsAmount: f.tdsPercentage ? String(computeAutoTds(Number(f.basicAmount) || 0, Number(f.tdsPercentage))) : '0' }));
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form.projectId) throw new Error('Project is required');
      if (!form.subcontractorId) throw new Error('Subcontractor is required');
      if (!form.invoiceNumber.trim()) throw new Error('Invoice Number is required');
      if (!form.invoiceDate) throw new Error('Invoice Date is required');
      if (!(basicAmount >= 0) || form.basicAmount === '') throw new Error('Basic Amount is required');

      return subcontractorPaymentsApi.create({
        projectId: form.projectId,
        subcontractorId: form.subcontractorId,
        billingMonth: Number(form.billingMonth),
        billingYear: Number(form.billingYear),
        invoiceNumber: form.invoiceNumber.trim(),
        invoiceDate: form.invoiceDate,
        foraysWoNumber: form.foraysWoNumber.trim() || undefined,
        basicAmount,
        additionalAmount,
        additionalAmountType: form.additionalAmountType || undefined,
        gstAmount,
        tdsPercentage: form.tdsPercentage ? Number(form.tdsPercentage) : undefined,
        tdsAmount,
        tdsCalculationMode: tdsMode,
        tollAmount,
        remarks: form.remarks.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Subcontractor bill saved successfully');
      queryClient.invalidateQueries({ queryKey: ['subcontractor-bills'] });
      queryClient.invalidateQueries({ queryKey: ['subcontractor-bill-totals'] });
      queryClient.invalidateQueries({ queryKey: ['subcontractor-payment-due'] });
      reset();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add New Subcontractor Bill"
      size="lg"
      footer={
        <>
          <button
            className="btn-secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Project Number *</label>
            <select className="input" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">Select Project</option>
              {projectOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Subcontractor Company Name *</label>
            <select className="input" value={form.subcontractorId} onChange={(e) => setForm((f) => ({ ...f, subcontractorId: e.target.value }))}>
              <option value="">Select Subcontractor</option>
              {subcontractorOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Billing Month *</label>
            <select className="input" value={form.billingMonth} onChange={(e) => setForm((f) => ({ ...f, billingMonth: e.target.value }))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Billing Year *</label>
            <input type="number" className="input" value={form.billingYear} onChange={(e) => setForm((f) => ({ ...f, billingYear: e.target.value }))} />
          </div>
          <div>
            <label className="label">Forays WO Number</label>
            <input className="input" value={form.foraysWoNumber} onChange={(e) => setForm((f) => ({ ...f, foraysWoNumber: e.target.value }))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Invoice Number *</label>
            <input className="input" value={form.invoiceNumber} onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))} />
          </div>
          <div>
            <label className="label">Invoice Date *</label>
            <input type="date" className="input" value={form.invoiceDate} onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Basic Amount *</label>
            <input type="number" min="0" step="0.01" className="input" value={form.basicAmount} onChange={(e) => handleBasicAmountChange(e.target.value)} />
          </div>
          <div>
            <label className="label">Toll Amount</label>
            <input type="number" min="0" step="0.01" className="input" value={form.tollAmount} onChange={(e) => setForm((f) => ({ ...f, tollAmount: e.target.value }))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Additional Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={form.additionalAmount}
              onChange={(e) => setForm((f) => ({ ...f, additionalAmount: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Additional Amount Description</label>
            <select
              className="input"
              value={form.additionalAmountType}
              onChange={(e) => setForm((f) => ({ ...f, additionalAmountType: e.target.value as AdditionalAmountType }))}
            >
              <option value="">Select</option>
              {ADDITIONAL_AMOUNT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">GST Amount</label>
          <input type="number" min="0" step="0.01" className="input" value={form.gstAmount} onChange={(e) => setForm((f) => ({ ...f, gstAmount: e.target.value }))} />
        </div>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">TDS Percentage</label>
              <select className="input" value={form.tdsPercentage} onChange={(e) => handlePercentageChange(e.target.value)}>
                <option value="">No TDS</option>
                {TDS_PERCENTAGE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">TDS Amount</label>
              <input type="number" min="0" step="0.01" className="input" value={form.tdsAmount} onChange={(e) => handleManualTdsAmount(e.target.value)} />
            </div>
          </div>
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
        </div>

        <div>
          <label className="label">Remarks</label>
          <textarea className="input" rows={2} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-400">Gross Bill Amount</p>
            <p className="text-lg font-bold">{formatRupees(grossBillAmount)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-400">Net Payable Amount</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatRupees(netPayableAmount)}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
