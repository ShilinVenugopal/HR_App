import { useQuery } from '@tanstack/react-query';
import { Mail, MessageCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Skeleton } from '../common/Skeleton';
import { communicationApi } from '../../api/modules';

const STATUS_VERB: Record<string, string> = {
  QUEUED: 'Queued',
  SENDING: 'Sending',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  OPENED: 'Opened',
  FAILED: 'Failed to send',
  BOUNCED: 'Bounced',
  CANCELLED: 'Cancelled',
};

export function CandidateTimelineModal({
  candidateId,
  candidateName,
  onClose,
}: {
  candidateId: string | null;
  candidateName?: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['comm-timeline', candidateId],
    queryFn: () => communicationApi.timeline(candidateId!),
    enabled: Boolean(candidateId),
  });

  return (
    <Modal open={Boolean(candidateId)} onClose={onClose} title={`Communication Timeline — ${candidateName ?? ''}`} size="md">
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!isLoading && !data?.length && <p className="py-8 text-center text-sm text-slate-400">No communication sent to this candidate yet.</p>}

      {!isLoading && Boolean(data?.length) && (
        <ol className="relative border-l border-slate-200 pl-5 dark:border-slate-800">
          {data!.map((log) => (
            <li key={log.id} className="mb-5 last:mb-0">
              <span className="absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-600" />
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {log.channel === 'EMAIL' ? <Mail size={12} /> : <MessageCircle size={12} />}
                {new Date(log.createdAt).toLocaleString()}
              </div>
              <p className="mt-0.5 text-sm font-medium">
                {log.batch?.template?.name ?? (log.channel === 'EMAIL' ? 'Email' : 'WhatsApp message')} — {STATUS_VERB[log.status] ?? log.status}
              </p>
              {log.subject && <p className="text-sm text-slate-500">{log.subject}</p>}
              <div className="mt-1 flex items-center gap-2">
                <Badge value={log.status} />
                {log.batch?.createdBy?.name && <span className="text-xs text-slate-400">by {log.batch.createdBy.name}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
