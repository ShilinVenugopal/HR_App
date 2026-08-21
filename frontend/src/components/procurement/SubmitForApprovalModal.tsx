import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../common/Modal';
import { ApproverOption } from '../../api/modules';

export function SubmitForApprovalModal({
  open,
  projectId,
  queryKey,
  fetchApprovers,
  moduleLabel,
  onClose,
  onConfirm,
  submitting,
}: {
  open: boolean;
  projectId: string;
  /// react-query cache key prefix (e.g. 'pr-approvers' / 'po-approvers') so
  /// PR and PO approver lists don't collide in the cache.
  queryKey: string;
  fetchApprovers: (projectId: string) => Promise<ApproverOption[]>;
  moduleLabel: string;
  onClose: () => void;
  onConfirm: (approverId: string) => void;
  submitting?: boolean;
}) {
  const [approverId, setApproverId] = useState('');

  const { data: approvers, isLoading } = useQuery({
    queryKey: [queryKey, projectId],
    queryFn: () => fetchApprovers(projectId),
    enabled: open && Boolean(projectId),
  });

  const handleClose = () => {
    setApproverId('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Proceed for Approval"
      footer={
        <>
          <button className="btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!approverId || submitting} onClick={() => onConfirm(approverId)}>
            Submit
          </button>
        </>
      }
    >
      <div>
        <label className="label">Select Approver *</label>
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading eligible approvers...</p>
        ) : approvers && approvers.length > 0 ? (
          <select className="input" value={approverId} onChange={(e) => setApproverId(e.target.value)}>
            <option value="">Select approver...</option>
            {approvers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.email})
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-red-500">
            No eligible approvers found for this project. A Super Admin must grant "Approve" permission on {moduleLabel} to at least one
            user assigned to this project.
          </p>
        )}
      </div>
    </Modal>
  );
}
