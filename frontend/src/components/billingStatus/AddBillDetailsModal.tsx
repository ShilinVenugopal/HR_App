import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useProjectOptions } from '../../hooks/useLookups';
import { apiErrorMessage } from '../../api/client';
import { BILLING_STATUS_OPTIONS, BillingItemInput, BillingItemStatus, billingStatusApi } from '../../api/modules';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DraftRow {
  key: string;
  plantUnit: string;
  invoiceNo: string;
  jmsNo: string;
  abstractAmount: string;
  taxAmount: string;
  status: BillingItemStatus;
}

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `bill-row-${keyCounter}`;
}

function emptyRow(): DraftRow {
  return { key: newKey(), plantUnit: '', invoiceNo: '', jmsNo: '', abstractAmount: '', taxAmount: '', status: 'PENDING_CERTIFICATION' };
}

export function AddBillDetailsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const projectOptions = useProjectOptions();

  const now = new Date();
  const [projectId, setProjectId] = useState('');
  const [billingMonth, setBillingMonth] = useState(String(now.getMonth() + 1));
  const [billingYear, setBillingYear] = useState(String(now.getFullYear()));
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);

  useEffect(() => {
    if (open) {
      setProjectId('');
      setBillingMonth(String(now.getMonth() + 1));
      setBillingYear(String(now.getFullYear()));
      setPeriodFrom('');
      setPeriodTo('');
      setRows([emptyRow()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (key: string) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  const updateRow = (key: string, patch: Partial<DraftRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const computeTotal = (row: DraftRow) => (Number(row.abstractAmount) || 0) + (Number(row.taxAmount) || 0);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('Select a project');
      const items: BillingItemInput[] = rows
        .filter((r) => r.plantUnit.trim())
        .map((r) => ({
          plantUnit: r.plantUnit.trim(),
          invoiceNo: r.invoiceNo.trim() || undefined,
          jmsNo: r.jmsNo.trim() || undefined,
          abstractAmount: Number(r.abstractAmount) || 0,
          taxAmount: Number(r.taxAmount) || 0,
          status: r.status,
        }));
      if (!items.length) throw new Error('Add at least one bill row with Plant/Unit filled in');
      if (items.some((it) => it.abstractAmount <= 0)) throw new Error('Abstract Amount is required and must be greater than 0 for every row');

      return billingStatusApi.create({
        projectId,
        billingMonth: Number(billingMonth),
        billingYear: Number(billingYear),
        periodFrom: periodFrom || undefined,
        periodTo: periodTo || undefined,
        items,
      });
    },
    onSuccess: () => {
      toast.success('Bill details saved');
      queryClient.invalidateQueries({ queryKey: ['billing-status'] });
      queryClient.invalidateQueries({ queryKey: ['billing-status-summary'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Bill Details"
      size="xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className="label">Project *</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select project...</option>
              {projectOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Billing Month *</label>
            <select className="input" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Billing Year *</label>
            <input type="number" className="input" value={billingYear} onChange={(e) => setBillingYear(e.target.value)} />
          </div>
          <div />
          <div>
            <label className="label">Period From</label>
            <input type="date" className="input" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Period To</label>
            <input type="date" className="input" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between bg-slate-100 px-3 py-2 text-sm font-semibold dark:bg-slate-800">
            <span>Bill Rows</span>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={addRow}>
              <Plus size={14} /> Add Row
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-1.5">Sr No</th>
                  <th className="px-2 py-1.5">Plant/Unit *</th>
                  <th className="px-2 py-1.5">Invoice No</th>
                  <th className="px-2 py-1.5">JMS No</th>
                  <th className="px-2 py-1.5">Abstract Amount *</th>
                  <th className="px-2 py-1.5">Tax Amount</th>
                  <th className="px-2 py-1.5">Total Amount</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row, idx) => (
                  <tr key={row.key}>
                    <td className="px-2 py-1.5">{idx + 1}</td>
                    <td className="px-1 py-1">
                      <input className="input py-1 text-xs" value={row.plantUnit} onChange={(e) => updateRow(row.key, { plantUnit: e.target.value })} />
                    </td>
                    <td className="px-1 py-1">
                      <input className="input py-1 text-xs" value={row.invoiceNo} onChange={(e) => updateRow(row.key, { invoiceNo: e.target.value })} />
                    </td>
                    <td className="px-1 py-1">
                      <input className="input py-1 text-xs" value={row.jmsNo} onChange={(e) => updateRow(row.key, { jmsNo: e.target.value })} />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input py-1 text-xs"
                        value={row.abstractAmount}
                        onChange={(e) => updateRow(row.key, { abstractAmount: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input py-1 text-xs"
                        value={row.taxAmount}
                        onChange={(e) => updateRow(row.key, { taxAmount: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5 font-medium">₹{computeTotal(row).toLocaleString('en-IN')}</td>
                    <td className="px-1 py-1">
                      <select className="input py-1 text-xs" value={row.status} onChange={(e) => updateRow(row.key, { status: e.target.value as BillingItemStatus })}>
                        {BILLING_STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <button className="btn-ghost p-1 text-red-500" disabled={rows.length === 1} onClick={() => removeRow(row.key)} title="Remove Row">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}
