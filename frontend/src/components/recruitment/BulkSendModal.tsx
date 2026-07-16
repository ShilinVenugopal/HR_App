import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Paperclip, Send, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../common/Modal';
import { apiErrorMessage } from '../../api/client';
import { CommChannel, communicationApi } from '../../api/modules';
import { uploadsApi } from '../../api/modules';
import { MANUAL_PLACEHOLDER_KEYS, PLACEHOLDER_VARIABLES } from '../../utils/communicationConstants';

export function BulkSendModal({
  open,
  onClose,
  channel,
  selectedCandidateIds,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  channel: CommChannel;
  selectedCandidateIds: string[];
  onSent: () => void;
}) {
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<{ filename: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'now' | 'schedule'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('');
  const [location, setLocation] = useState('');
  const [testRecipient, setTestRecipient] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEmail = channel === 'EMAIL';
  const label = isEmail ? 'Email' : 'WhatsApp';

  const reset = () => {
    setTemplateId('');
    setSubject('');
    setBody('');
    setAttachments([]);
    setScheduleMode('now');
    setScheduleDate('');
    setScheduleTime('');
    setInterviewDate('');
    setInterviewTime('');
    setLocation('');
    setTestRecipient('');
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const { data: templates } = useQuery({
    queryKey: ['comm-templates', channel],
    queryFn: () => communicationApi.templates.list(channel),
    enabled: open,
  });

  const { data: config } = useQuery({ queryKey: ['comm-config'], queryFn: communicationApi.config, enabled: open });

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates?.find((t) => t.id === id);
    if (template) {
      setSubject(template.subject ?? '');
      setBody(template.body);
    }
  };

  const insertPlaceholder = (key: string) => {
    const token = `{{${key}}}`;
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  };

  const handleFileSelect = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Attachment is too large. Maximum size is 20 MB.');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadsApi.upload(file);
      setAttachments((prev) => [...prev, { filename: uploaded.originalName, url: uploaded.url }]);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Attachment upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const variables = { interview_date: interviewDate, interview_time: interviewTime, location };

  const testMutation = useMutation({
    mutationFn: () => communicationApi.sendTest({ channel, subject, body, testRecipient, variables }),
    onSuccess: (result) => {
      if (result.success) toast.success(`Test ${label.toLowerCase()} sent successfully`);
      else toast.error(result.errorReason ?? 'Test send failed');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Test send failed')),
  });

  const sendMutation = useMutation({
    mutationFn: () => {
      const scheduledAt =
        scheduleMode === 'schedule' && scheduleDate && scheduleTime ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString() : null;
      return communicationApi.send({
        channel,
        candidateIds: selectedCandidateIds,
        templateId: templateId || null,
        subject: isEmail ? subject : undefined,
        body,
        attachments,
        scheduledAt,
        variables,
      });
    },
    onSuccess: (batch) => {
      toast.success(
        batch.scheduledAt
          ? `${label} scheduled for ${batch.totalRecipients} candidate${batch.totalRecipients === 1 ? '' : 's'}`
          : `${label} queued for ${batch.totalRecipients} candidate${batch.totalRecipients === 1 ? '' : 's'}`
      );
      queryClient.invalidateQueries({ queryKey: ['comm-history'] });
      queryClient.invalidateQueries({ queryKey: ['comm-stats'] });
      onSent();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to send')),
  });

  const canSend = body.trim().length > 0 && (scheduleMode === 'now' || (scheduleDate && scheduleTime));

  return (
    <Modal open={open} onClose={onClose} title={`Send Bulk ${label}`} size="xl">
      <div className="space-y-4">
        {config && !(isEmail ? config.emailConfigured : config.whatsappConfigured) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
            The {label} provider isn't configured yet. Messages will be queued but will fail to send until an administrator sets up
            {isEmail ? ' SMTP credentials' : ' the WhatsApp Business API'}.
          </div>
        )}

        <div>
          <label className="label">Recipients</label>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/40">
            {selectedCandidateIds.length} selected candidate{selectedCandidateIds.length === 1 ? '' : 's'}
          </p>
        </div>

        <div>
          <label className="label">Message Template</label>
          <select className="input" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">None — write a custom message</option>
            {templates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {isEmail && (
          <div>
            <label className="label">Subject</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" />
          </div>
        )}

        <div>
          <label className="label">Message *</label>
          <textarea
            ref={bodyRef}
            className="input font-mono text-sm"
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Dear {{candidate_name}},\n\nYou have been shortlisted for {{designation}}...`}
          />
        </div>

        <div>
          <p className="label mb-1.5">Insert placeholder</p>
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDER_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                className="badge bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={() => insertPlaceholder(v.key)}
              >
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Interview Date</label>
            <input type="date" className="input" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Interview Time</label>
            <input type="time" className="input" value={interviewTime} onChange={(e) => setInterviewTime(e.target.value)} />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Venue / address" />
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-400">
          Fills {MANUAL_PLACEHOLDER_KEYS.map((k) => `{{${k}}}`).join(', ')} — every other placeholder is filled automatically per candidate.
        </p>

        <div>
          <label className="label">Attachments</label>
          <div className="flex flex-wrap items-center gap-2">
            {attachments.map((a, i) => (
              <span key={i} className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Paperclip size={11} className="mr-1" />
                {a.filename}
                <X size={12} className="ml-1 cursor-pointer" onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} />
              </span>
            ))}
            <button type="button" className="btn-secondary px-2.5 py-1.5 text-xs" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
              Browse
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <label className="label mb-2">Delivery</label>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={scheduleMode === 'now'} onChange={() => setScheduleMode('now')} /> Send Now
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={scheduleMode === 'schedule'} onChange={() => setScheduleMode('schedule')} /> Schedule
            </label>
            {scheduleMode === 'schedule' && (
              <>
                <input type="date" className="input w-auto" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
                <input type="time" className="input w-auto" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
                <span className="text-xs text-slate-400">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <label className="label mb-2">Send Test {label}</label>
          <div className="flex flex-wrap gap-2">
            <input
              className="input flex-1"
              placeholder={isEmail ? 'test@example.com' : '+919999999999'}
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
            />
            <button
              type="button"
              className="btn-secondary"
              disabled={!testRecipient || !body.trim() || testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              {testMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Send Test
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!canSend || sendMutation.isPending} onClick={() => sendMutation.mutate()}>
            {sendMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {scheduleMode === 'schedule' ? 'Schedule' : 'Send'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
