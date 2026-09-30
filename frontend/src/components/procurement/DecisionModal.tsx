import { useState } from 'react';
import { Modal } from '../common/Modal';

export type DecisionAction = 'APPROVE' | 'REJECT' | 'RETURN';

const CONFIG: Record<DecisionAction, { title: string; confirmLabel: string; commentsRequired: boolean; confirmClass: string }> = {
  APPROVE: { title: 'Approve', confirmLabel: 'Approve', commentsRequired: false, confirmClass: 'btn-primary' },
  REJECT: { title: 'Reject', confirmLabel: 'Reject', commentsRequired: true, confirmClass: 'btn-danger' },
  RETURN: { title: 'Return to Requester', confirmLabel: 'Return', commentsRequired: true, confirmClass: 'btn-secondary' },
};

export function DecisionModal({
  open,
  action,
  documentLabel,
  onClose,
  onConfirm,
  submitting,
}: {
  open: boolean;
  action: DecisionAction;
  /// e.g. "Purchase Requisition" / "Purchase Order" — appended to the
  /// modal title so it reads naturally for whichever document called it.
  documentLabel: string;
  onClose: () => void;
  onConfirm: (comments: string) => void;
  submitting?: boolean;
}) {
  const [comments, setComments] = useState('');
  const cfg = CONFIG[action];

  const handleClose = () => {
    setComments('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`${cfg.title} ${documentLabel}`}
      footer={
        <>
          <button className="btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button
            className={cfg.confirmClass}
            disabled={submitting || (cfg.commentsRequired && !comments.trim())}
            onClick={() => onConfirm(comments.trim())}
          >
            {cfg.confirmLabel}
          </button>
        </>
      }
    >
      <div>
        <label className="label">Comments {cfg.commentsRequired ? '*' : '(optional)'}</label>
        <textarea className="input" rows={4} value={comments} onChange={(e) => setComments(e.target.value)} />
        {cfg.commentsRequired && !comments.trim() && <p className="mt-1 text-xs text-slate-400">Comments are required for this action.</p>}
      </div>
    </Modal>
  );
}
