export const PLACEHOLDER_VARIABLES = [
  { key: 'candidate_name', label: 'Candidate Name' },
  { key: 'designation', label: 'Designation' },
  { key: 'assigned_project', label: 'Assigned Project' },
  { key: 'qualification', label: 'Qualification' },
  { key: 'experience', label: 'Experience' },
  { key: 'contact_number', label: 'Contact Number' },
  { key: 'email', label: 'Email' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'client_name', label: 'Client Name' },
  { key: 'interview_date', label: 'Interview Date' },
  { key: 'interview_time', label: 'Interview Time' },
  { key: 'location', label: 'Location' },
  { key: 'recruiter_name', label: 'Recruiter Name' },
] as const;

/// interview_date / interview_time / location have no natural source on
/// the candidate/project records — the sender fills these in per-batch.
export const MANUAL_PLACEHOLDER_KEYS = ['interview_date', 'interview_time', 'location'] as const;

export const EMAIL_TEMPLATE_CATEGORIES = [
  'Interview Call',
  'Interview Confirmation',
  'Documents Required',
  'Offer Letter',
  'Joining Instructions',
  'Medical Test',
  'Visa Processing',
  'Candidate Follow-up',
  'General Announcement',
];

export const WHATSAPP_TEMPLATE_CATEGORIES = [
  'Interview Call',
  'Document Submission',
  'Reminder',
  'Medical Test',
  'Offer Letter',
  'Visa Update',
  'Travel Details',
  'Joining Date',
  'General Notification',
];

export const MESSAGE_STATUS_OPTIONS = ['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'BOUNCED', 'CANCELLED'];
