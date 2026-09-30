import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Modal } from '../common/Modal';
import { apiErrorMessage } from '../../api/client';
import { billingStatusApi } from '../../api/modules';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
];

const FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'project', label: 'Project' },
  { value: 'invoiceNo', label: 'Invoice No.' },
  { value: 'invoiceDate', label: 'Invoice Date' },
  { value: 'invoiceAmount', label: 'Invoice Amount' },
  { value: 'amountReceived', label: 'Amount Received' },
  { value: 'outstandingAmount', label: 'Outstanding Amount' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'paymentStatus', label: 'Payment Status' },
];

/// Super-Admin-only (the route itself is gated by requireSuperAdmin — this
/// modal is only ever opened for a Super Admin from BillingStatus.tsx, but
/// the backend enforcement is what actually matters). Never touches any
/// invoice/payment row, only this one settings record.
export function NotificationSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['billing-notification-settings'],
    queryFn: () => billingStatusApi.getNotificationSettings(),
    enabled: open,
  });

  const [enabled, setEnabled] = useState(true);
  const [dueDays, setDueDays] = useState('30');
  const [visibleStatuses, setVisibleStatuses] = useState<string[]>(['UNPAID', 'PARTIALLY_PAID', 'OVERDUE']);
  const [visibleFields, setVisibleFields] = useState<string[]>(FIELD_OPTIONS.map((f) => f.value));

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setDueDays(String(settings.dueDays));
    setVisibleStatuses(settings.visibleStatuses);
    setVisibleFields(settings.visibleFields);
  }, [settings]);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const days = Number(dueDays);
      if (!(days >= 1)) throw new Error('Payment due period must be at least 1 day');
      return billingStatusApi.updateNotificationSettings({ enabled, dueDays: days, visibleStatuses, visibleFields });
    },
    onSuccess: () => {
      toast.success('Notification settings saved');
      queryClient.invalidateQueries({ queryKey: ['billing-notification-settings'] });
      queryClient.invalidateQueries({ queryKey: ['billing-payment-due'] });
      queryClient.invalidateQueries({ queryKey: ['billing-status'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Payment Due Notification Settings (Super Admin)"
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
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable Payment Due Notifications
        </label>
        <p className="text-xs text-slate-400">
          Disabling this hides the Payment Due Notifications section for everyone — it never deletes any invoice or payment record.
        </p>

        <div>
          <label className="label">Payment Due Period (days after Invoice Date)</label>
          <input
            type="number"
            min="1"
            max="365"
            className="input w-40"
            value={dueDays}
            onChange={(e) => setDueDays(e.target.value)}
            disabled={!enabled}
          />
          <p className="mt-1 text-xs text-slate-400">Default 30 days. Changing this recalculates every invoice's due date immediately.</p>
        </div>

        <div>
          <label className="label">Payment Statuses Shown in the Notification Section</label>
          <div className="flex flex-wrap gap-3">
            {STATUS_OPTIONS.map((s) => (
              <label key={s.value} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={visibleStatuses.includes(s.value)}
                  disabled={!enabled}
                  onChange={() => toggle(visibleStatuses, setVisibleStatuses, s.value)}
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Fields Shown in the Notification Table</label>
          <div className="grid grid-cols-2 gap-2">
            {FIELD_OPTIONS.map((f) => (
              <label key={f.value} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={visibleFields.includes(f.value)}
                  disabled={!enabled}
                  onChange={() => toggle(visibleFields, setVisibleFields, f.value)}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
